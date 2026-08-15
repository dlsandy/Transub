/**
 * Bundle Pro algorithms into minified `_advanced/index.js` for commercial installs.
 * Source stays in-tree for tests / unpackaged dev; packaged asar excludes those files.
 *
 * Host helpers (LLM client, license data, etc.) stay external and are resolved at
 * runtime via `__dirname` — never bake absolute build-machine paths into the blob.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '_advanced');
const outfile = path.join(outDir, 'index.js');
const entry = path.join(__dirname, 'advanced-module-entry.js');

/** Host modules that must remain outside the proprietary blob. */
const HOST_HELPER_NAMES = new Set([
    'advanced-llm-client',
    'advanced-llama-server',
    'advanced-managed-llm',
    'advanced-license-data',
    'advanced-llm-resolve',
    'advanced-llm-fs',
    'ipc-validate',
    'app-paths',
    'smart-translate-hybrid',
]);

const hostHelperRe = new RegExp(
    `(?:^|[\\\\/])(?:${[...HOST_HELPER_NAMES].join('|')})(?:\\.js)?$`,
);

/** Runtime shim: resolve host electron/*.js next to install root (asar or unpackaged). */
const HOST_REQUIRE_BANNER = `"use strict";
var __transubHostReq=(function(){
  var p=require("path"),f=require("fs");
  var bases=[
    p.join(__dirname,"..","resources","app.asar","electron"),
    p.join(__dirname,"..","electron")
  ];
  return function(name){
    var file=String(name||"");
    if(!/\\.js$/i.test(file)) file+=".js";
    var lastErr=null;
    for(var i=0;i<bases.length;i++){
      var full=p.join(bases[i],file);
      try{
        if(f.existsSync(full)) return require(full);
      }catch(e){ lastErr=e; }
    }
    // Electron asar: existsSync can miss; try packaged path then unpackaged.
    try{ return require(p.join(bases[0],file)); }
    catch(e0){
      try{ return require(p.join(bases[1],file)); }
      catch(e1){ throw lastErr||e0||e1; }
    }
  };
})();
`;

function assertNoAbsoluteHostPaths(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    // Drive-letter absolute requires (Windows) or Unix /Users|/home build paths
    const abs = text.match(/require\(["'](?:[A-Za-z]:\\|\/(?:Users|home|tmp)\/)[^"']+["']\)/g);
    if (abs && abs.length) {
        throw new Error(
            `_advanced/index.js still embeds absolute require path(s):\n  ${abs.slice(0, 5).join('\n  ')}`,
        );
    }
}

async function main() {
    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch (err) {
        console.error('[build-advanced] esbuild required:', err.message || err);
        process.exit(1);
    }

    fs.mkdirSync(outDir, { recursive: true });

    const result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        minify: true,
        legalComments: 'none',
        target: ['node22'],
        banner: { js: HOST_REQUIRE_BANNER },
        // Keep host app modules out of the proprietary blob; algorithms + prompts inline.
        external: [
            'electron',
            'undici',
            'json5',
        ],
        plugins: [
            {
                name: 'external-host-llm-helpers',
                setup(build) {
                    build.onResolve({ filter: hostHelperRe }, (args) => {
                        if (args.path.includes('node_modules')) return null;
                        const resolved = path.isAbsolute(args.path)
                            ? args.path
                            : path.join(args.resolveDir, args.path);
                        const base = path.basename(resolved, path.extname(resolved) || '.js');
                        if (!HOST_HELPER_NAMES.has(base)) return null;
                        return {
                            path: `transub-host:${base}`,
                            namespace: 'transub-host',
                        };
                    });
                    build.onLoad({ filter: /.*/, namespace: 'transub-host' }, (args) => {
                        const name = String(args.path || '').replace(/^transub-host:/, '');
                        return {
                            contents: `module.exports=__transubHostReq(${JSON.stringify(`${name}.js`)});`,
                            loader: 'js',
                        };
                    });
                },
            },
        ],
        logLevel: 'warning',
    });

    if (result.errors?.length) {
        console.error('[build-advanced] bundle failed');
        process.exit(1);
    }

    try {
        assertNoAbsoluteHostPaths(outfile);
    } catch (err) {
        console.error('[build-advanced]', err.message || err);
        process.exit(1);
    }

    const stat = fs.statSync(outfile);
    // Marker so verify/packaging can assert a real proprietary module is present.
    fs.writeFileSync(
        path.join(outDir, 'MODULE.json'),
        `${JSON.stringify({
            name: 'Transub Pro',
            builtAt: new Date().toISOString(),
            bytes: stat.size,
            entry: 'index.js',
        }, null, 2)}\n`,
        'utf8',
    );

    console.log(`[build-advanced] wrote ${path.relative(root, outfile)} (${stat.size} bytes)`);
}

main().catch((err) => {
    console.error('[build-advanced]', err?.message || err);
    process.exit(1);
});
