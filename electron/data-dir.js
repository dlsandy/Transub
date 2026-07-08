const fs = require('fs');
const path = require('path');

const DATA_DIR_NAME = 'data';

function resolveDataDirRoot(getAppRoot) {
    const appRoot = path.resolve(getAppRoot());
    if (fs.existsSync(path.join(appRoot, DATA_DIR_NAME))) {
        return appRoot;
    }
    const parent = path.join(appRoot, '..');
    if (fs.existsSync(path.join(parent, DATA_DIR_NAME))) {
        return parent;
    }
    return appRoot;
}

function getDataDir(getAppRoot) {
    return path.join(resolveDataDirRoot(getAppRoot), DATA_DIR_NAME);
}

module.exports = {
    DATA_DIR_NAME,
    resolveDataDirRoot,
    getDataDir,
};
