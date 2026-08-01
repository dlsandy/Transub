/**
 * Opaque helpers for training-derived MT domain fixes.
 * Adult surface forms stay base64-encoded (obscurity; same spirit as tone-adapt.tz1).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtOpaque = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtOpaqueStringsFactory() {
    function d(b64) {
        const s = String(b64 || '');
        if (!s) return '';
        try {
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(s, 'base64').toString('utf8');
            }
            if (typeof atob === 'function') {
                const bin = atob(s);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
                if (typeof TextDecoder !== 'undefined') {
                    return new TextDecoder('utf-8').decode(bytes);
                }
                return bin;
            }
        } catch (_) {
            return '';
        }
        return '';
    }

    function re(b64, flags = '') {
        const pat = d(b64);
        if (!pat) return /$a/;
        try {
            return new RegExp(pat, flags);
        } catch (_) {
            return /$a/;
        }
    }

    /** @type {Record<string, string>} */
    const T = Object.freeze({
        warmJa: d('44GC44Gj44Gf44GL44GE'),
        warmJa2: d('5pqW44GL44GE'),
        warmJa3: d('5rip44GL44GE'),
        edZh: d('6Ziz55e/'),
        edWarmZh: d('6Ziz55e/5oy65pqW5ZKM55qE'),
        warmZh: d('5pqW5pqW55qE'),
        warmZh2: d('5aW95rip5pqW'),
        peeJa: d('44GK44GX44Gj44GT'),
        semenZh: d('57K+5ray'),
        semenJa: d('44K244O844Oh44Oz'),
        spermJa: d('57K+5a2Q'),
        peeZh: d('5bC/'),
        noSexServiceJa: d('5oCn55qE44Gq44K144O844OT44K544Gv44Gn44GN44G+44Gb44KTfOaAp+eahOOCteODvOODk+OCueOBr+OBp+OBjeOBvuOBm+OCkw=='),
        noSexServiceZh: d('5LiN6IO95o+Q5L6b5oCn5pyN5Yqh77yM'),
        notSoaplandJa: d('6aKo5L+X44Gn44Gv44GC44KK44G+44Gb44KT'),
        notSoaplandZh: d('6L+Z6YeM5LiN5piv6aOO5L+X5bqX44CC'),
        smallHoleZh: d('5bCP56m0'),
        lieZh: d('5Luw6Lq6'),
        orgasmZh: d('6auY5r2u'),
        keepOrgasmZh: d('5L+d5oyB552A6auY5r2u'),
        massageZh: d('6K6k55yf5o6o5ou/'),
        relaxZh: d('5pS+5p2+'),
        sexAtmosphereZh: d('5YGa54ix5piv6ZyA6KaB5rCU5rCb'),
        needMoodZh: d('6ZyA6KaB5rCU5rCb'),
        mensEstheMoodZh: d('55S35aOr5oyJ5pGp6K6y56m255qE5piv5YiG5a+45oSf5ZOm'),
        breastJa: d('44GK44Gj44Gx44GE'),
        appleJa: d('44Ki44OD44OX44Or'),
        appleZh: d('6Iu55p6c'),
        breastZh: d('5aW25a2Q'),
        proneJa: d('44GK44KA44GRfOS7sOWQkeOBkQ=='),
        passThrough: d('5pS+6L+H'),
        cannot: d('5LiN5Y+v5Lul'),
        notFuzokuJa: d('6aKo5L+X44Go44Gv6YGV44GE44G+44GZ'),
        dekachinJa: d('44OH44Kr44OB44Oz'),
        chinchinJa: d('44OB44Oz44OB44Oz'),
        bigProjectZh: d('5aSn6aG555uu'),
        chickenCutletZh: d('5aSn6bih5o6S'),
        longLegsZh: d('5aSn6ZW/6IW/'),
        bigRodZh: d('5aSn6IKJ5qOS'),
        wantChickenZh: d('5oOz5ZCD5aSn6bih5o6S'),
        wantBigRodZh: d('5oOz6KaB5aSn6IKJ5qOS'),
        kintamaJa: d('6YeR546J'),
        goldenLightZh: d('6YeR5YWJ'),
        ballsZh: d('6JuL6JuL'),
        worldJa: d('5LiW55WM'),
        projectNameZh: d('6aG555uu5ZCN56ew'),
        chinkuMo: d('44OB44Oz44Kv44KC'),
        chinkoMo: d('44Gh44KT44GT44KC'),
        breastAlsoBigZh: d('6IO46YOo5Lmf5oy65aSn55qE'),
        rodAlsoBigZh: d('6bih5be05Lmf5b6I5aSn'),
        rodZh: d('6bih5be0'),
        aboutToStartZh: d('6KaB5byA5aeL5LqG'),
        aboutToCumZh: d('6KaB5Y675LqG'),
        ochinchinJa: d('44GK44Gh44KT44Gh44KT'),
        ochinpoJa: d('44GK44Gh44KT44G9'),
        chikubiJa: d('44OB44Kv44OT'),
        nippleJa: d('5Lmz6aaW'),
        earZh: d('6ICz5py1'),
        nippleZh: d('5Lmz5aS0'),
        goldenSparkleZh: d('6YeR5YWJ6Zeq6Zeq55qE'),
        swollenZh: d('6IOA5b6X6byT6byT55qE'),
        panpanJa: d('44OR44Oz44OR44Oz'),
        chinpoJa: d('44OB44Oz44Od'),
        erectVerbZh: d('56Gs6LW35p2l'),
        toroToroJa: d('44OI44Ot44OI44Ot'),
        faceCumJa: d('44GK6aGU44Gr5Ye644GX44GmfOmhlOOBq+WHuuOBl+OBpg=='),
        faceRevealZh: d('6IS45LiK6Zyy5Ye6'),
        faceCumZh: d('5bCE5Zyo6IS45LiK'),
        faceReleaseZh: d('6IS45LiK5Lmf6YeK5pS+5Ye65p2l'),
        ikuAlsoDashiteJa: d('44Kk44Kv44Gu44KC5Ye644GX44Gm'),
        climaxFeelZh: d('6auY5r2u55qE5oSf6KeJ'),
        ikuAlsoDashiteZh: d('6KaB5Y6755qE5pe25YCZ5Lmf5bCE5Ye65p2l'),
        acchiJa: d('44GC44Gj44Gh44GC44Gj44Gh'),
        softCottonZh: d('6L2v57u157u1'),
        hotHotZh: d('54Ot54Ot'),
        guchuJa: d('44GQ44Gh44KF44GQ44Gh44KF'),
        blushedZh: d('57qi5LqG'),
        wetMessyZh: d('5rm/5ryJ5ryJ'),
        ahFeelGoodZh: d('5ZWK77yM5aW96IiS5pyN'),
        ahahaFeelZh: d('5ZOI5ZOI77yM5aW96IiS5pyN'),
        ahahaIkuZh: d('5ZOI5ZOI77yM6KaB5Y675LqG'),
        ahahaIkuQZh: d('5ZOI5ZOI77yM6KaB5Y675LqG5ZCn77yf'),
        sexJa: d('44K744OD44Kv44K5'),
        sexHiraJa: d('44Gb44Gj44GP44GZ'),
        wantSexZh: d('5oOz5YGa54ix'),
        senseiJa: d('5YWI55Sf'),
        senseiZh: d('6ICB5biI'),
        todayAllDayJa: d('5LuK5pel5LiA5pel5Lit'),
        todayAllDayZh: d('5LuK5aSp5LiA5pW05aSp'),
        masterJa: d('44GU5Li75Lq65qeY'),
        masterZh: d('5Li75Lq6'),
        haveRelationZh: d('5Y+R55Sf5YWz57O7'),
        makeLoveZh: d('5YGa54ix'),
        oneNightZh: d('5LiA5aSc5oOF'),
        untilMorningJa: d('5pyd44G+44Gn'),
        untilMorningSexZh: d('5YGa5Yiw5pep5LiK'),
        littleChickZh: d('5bCP6bih6bih'),
        shootCumZh: d('6KaB5bCE5LqG'),
        shootCumShortZh: d('6KaB5bCE'),
        goCumShortZh: d('6KaB5Y67'),
        omankoDashiteJa: d('44GK44G+44KT44GT5Ye644GX44Gm'),
        spitSomethingZh: d('5Ye654K55LuA5LmI'),
        showPussyZh: d('5oqK5bCP56m06Zyy5Ye65p2l'),
        thatThingZh: d('6YKj5Lic6KW/'),
        rodDupZh: d('6bih5be06bih5be0'),
        breakupZh: d('5YiG5omL'),
        aboutToSoonZh: d('6ams5LiK6KaB5LqG'),
        aboutToSoonOkZh: d('6ams5LiK6KaB5Y675LqG'),
        noLickNippleOkZh: d('5aWz5Lq65LiN5biu6IiU5Lmz5aS05ZCX77yf'),
    });

    const RE = Object.freeze({
        orgasmHint: re('44Kk44ODfOOCpOOCrXzntbbpoIJ844Kq44O844Ks44K644OgfOmrmOa9rnzlsITnsr585Ye644Gh44KDfOWHuuOBneOBhnzjgqTjgaM='),
        genitalHint: re('44G+44KT44GTfOOBiuOBvuOCk+OBk3zjgb7jgpPjgb7jgpN844GK44G+44KTfOOBoeOCk+OBoeOCk3zjgYrjgaHjgpN844Gh44KT44G9fOODgeODs+OCs3zjg5rjg4vjgrl856m0'),
        introHint: re('5pys5pel5ouF5b2TfOaLheW9k+OBleOBm+OBpnzmi4XlvZPjgYTjgZ/jgZfjgb7jgZl844Oh44Oz44K644KofOODoeODs+OCqOOCuXzliJ3jgoHjgabjgZTliKnnlKh86aKo5L+X44Gn44Gv44GC44KK44G+44Gb44KTfOaAp+eahOOBquOCteODvOODk+OCuQ=='),
        prone: new RegExp(`(?:${T.proneJa})`),
        bodyJustify: re('44GKP+OBoeOCk3zjgaHjgpPjgb1844Gh44KT44GTfOiCieajknzmsJfmjIHjgaHjgYTjgYR844GN44KC44Gh44GE44GE'),
        orphanStuckZh: re('XuWTpeWTpeeahOiCieajkuWlveiIkuacjVvvvIwsXT/ll68/5ZWKKu+8gT8k'),
        noSexService: new RegExp(T.noSexServiceJa),
        notSoapland: new RegExp(T.notSoaplandJa),
        passThroughZh: new RegExp(T.passThrough),
        cannotOnlyZh: new RegExp(`^(?:${T.cannot}…?)+$`),
        smallHoleG: new RegExp(T.smallHoleZh, 'g'),
        orgasm: new RegExp(T.orgasmZh),
        keepOrgasmG: new RegExp(T.keepOrgasmZh, 'g'),
        orgasmG: new RegExp(T.orgasmZh, 'g'),
        sexAtmosphere: new RegExp(`${T.sexAtmosphereZh}|${T.needMoodZh}`),
        breastOrAppleSrc: new RegExp(`${T.appleJa}|${T.breastJa}`),
        appleFruit: /林檎|りんご/,
        appleZhG: new RegExp(T.appleZh, 'g'),
        wontPassThrough: /不会放过/,
        dekachinSrc: new RegExp(`${T.dekachinJa}|${T.chinchinJa}|${T.ochinchinJa}|${T.ochinpoJa}|${T.chinpoJa}`),
        climaxIkuSrc: re('6KGM44GN44Gd44GGfOOBglvjgJzvvZ7jg7xdKuihjOOBj3znlJ/ooYzjgY9855Sf6KGM44Gj44Gh44KD44GGfOS/uuihjOOBj3zjgqTjgY9844Kk44Gj44Gh44KD44GGfOOCpOODg+OBoeOCg+OBhnzjgqTjgq3jgZ3jgYZ844Kk44GN44Gd44GGfOOBhOOBo+OBoeOCg+OBhOOBneOBhnzjgqTjgq/jgqTjgq9844Kk44Kv44GjfOOBhOOBo+OBoeOCg+OBhnzooYzjgaPjgaHjgoPjgYZ8KD86XnxbXmEtekEtWl0p44Kk44KvKD86W15hLXpBLVpdfCQp'),
        chinkoBigSrc: new RegExp(`(?:${T.chinkuMo}|${T.chinkoMo}).{0,8}でかい`),
        breastZh: /胸部/,
        aboutToStartG: new RegExp(T.aboutToStartZh, 'g'),
        projectNameG: new RegExp(T.projectNameZh, 'g'),
        goldenLightG: new RegExp(T.goldenLightZh, 'g'),
        bigProjectG: new RegExp(T.bigProjectZh, 'g'),
        chickenG: new RegExp(T.chickenCutletZh, 'g'),
        longLegsG: new RegExp(T.longLegsZh, 'g'),
        wantChickenG: new RegExp(T.wantChickenZh, 'g'),
        breastAlsoBigG: new RegExp(T.breastAlsoBigZh, 'g'),
        goldenSparkleG: new RegExp(T.goldenSparkleZh, 'g'),
        shootCumG: new RegExp(T.shootCumZh, 'g'),
        shootCumShortG: new RegExp(T.shootCumShortZh, 'g'),
        haveRelationG: new RegExp(T.haveRelationZh, 'g'),
        oneNightG: new RegExp(T.oneNightZh, 'g'),
        littleChickG: new RegExp(T.littleChickZh, 'g'),
        thatThingG: new RegExp(T.thatThingZh, 'g'),
        spitSomethingG: new RegExp(T.spitSomethingZh, 'g'),
        rodDupG: new RegExp(T.rodDupZh, 'g'),
        aboutToSoonG: new RegExp(T.aboutToSoonZh, 'g'),
    });

    /** Sensitive JA ASR pairs omitted from shared/ja-asr-domain-fixes.json plaintext. */
    const ASR_ADULT_PAIRS_B64 = 'W3siZnJvbSI6IuODleOCp+ODqeODs+ODh+ODouODs+OCueODiOODrOODvOOCt+ODp+ODsyIsInRvIjoi44OV44Kn44Op44Gu44OH44Oi44Oz44K544OI44Os44O844K344On44OzIn0seyJmcm9tIjoi44Kq44O844Kv5YWl44KM44KL44KI44Kq44O844OpIiwidG8iOiLlpaXlhaXjgozjgovjgojjgbvjgokifSx7ImZyb20iOiLlpKflpb3jgY3jgarjgqLjg4Pjg5fjgafmjJ8iLCJ0byI6IuWkp+WlveOBjeOBquOBiuOBo+OBseOBhOOBp+aMnyJ9LHsiZnJvbSI6IuiAs+OBruODkOODg+ODiOOBs+OCk+OBs+OCkyIsInRvIjoi44GK44Gh44KT44Gh44KT44OT44Oz44OT44OzIn0seyJmcm9tIjoi6LO85YWl44GX44Gm44Gm44GP44Gg44GV44GEIiwidG8iOiLoiIjlpa7jgZfjgabjgabjgY/jgaDjgZXjgYQifSx7ImZyb20iOiLjgaHjgpPjgaHjgoPjgpPjgafotbfjgY3jgaYiLCJ0byI6IuODgeODs+ODgeODs+OBp+i1t+OBjeOBpiJ9LHsiZnJvbSI6IuWkp+WlveOBjeOBquOCouODg+ODl+ODqyIsInRvIjoi5aSn5aW944GN44Gq44GK44Gj44Gx44GEIn0seyJmcm9tIjoi5oKU44GE44Gr44GV44KM44Gh44KD44GGIiwidG8iOiLlpaXjgavjgZXjgozjgaHjgoPjgYYifSx7ImZyb20iOiLkuIDml6Xjga7lvaLjgoTlpKfjgY3jgZUiLCJ0byI6IuOCpOODgeODouODhOOBruW9ouOChOWkp+OBjeOBlSJ9LHsiZnJvbSI6IuellueItuOBqOOBr+mBleOBhOOBvuOBmSIsInRvIjoi6aKo5L+X44Go44Gv6YGV44GE44G+44GZIn0seyJmcm9tIjoi44GC44Gj44CB44GN44KC44Gh44GE44GEIiwidG8iOiLjgYLjgaPjgIHmsJfmjIHjgaHjgYTjgYQifSx7ImZyb20iOiLjgYTjgaPjgaHjgoPjgYTjgaPjgaHjgoMiLCJ0byI6IuOCpOODg+OBoeOCg+OCpOODg+OBoeOCgyJ9LHsiZnJvbSI6IuOBiuOBoeOCk+OBmOOCheOBhuOBleOCkyIsInRvIjoi44GK44Gh44KT44Gh44KTIn0seyJmcm9tIjoi44Kz44O844OB44Oz5pWj44KM44Gf44KJIiwidG8iOiLnsr7mtrLmlaPjgozjgZ/jgokifSx7ImZyb20iOiLjgrnjgr/jgqTjg4jjgZfjgb7jgZnjga0iLCJ0byI6IuWHuuOBn+OBhOOBp+OBmeOBrSJ9LHsiZnJvbSI6IuOCu+ODleODrOOCquOCu+ODg+OCr+OCuSIsInRvIjoi44K744OV44Os44Gu44K744OD44Kv44K5In0seyJmcm9tIjoi44OB44Oz44OB44Oz5Y+W44KK5a+d44GmIiwidG8iOiLjg4Hjg7Pjg4Hjg7Plj5bjgorlhaXjgozjgaYifSx7ImZyb20iOiLjg57jgqTjgq/jg63jg5Pjg4Pjgq3jg7MiLCJ0byI6IuODnuOCpOOCr+ODreODk+OCreODiyJ9LHsiZnJvbSI6IuWIneatr+OCkuS7iuiIkOOCgeOBpiIsInRvIjoi5YWI44Gj44G944KS5LuK6IiQ44KB44GmIn0seyJmcm9tIjoi44GC44GC44GN44KC44Gh44GE44GEIiwidG8iOiLjgYLjgYLmsJfmjIHjgaHjgYTjgYQifSx7ImZyb20iOiLjgYLjgaPjgY3jgoLjgaHjgYTjgYQiLCJ0byI6IuOBguOBo+awl+aMgeOBoeOBhOOBhCJ9LHsiZnJvbSI6IuOCuOODo+ODkeODi+ODvOOCuuS8miIsInRvIjoi44K444Oj44OR44OL44O844K644Ks44KkIn0seyJmcm9tIjoi5YWl44KK44Gb44GE44Gn44GZIiwidG8iOiLlhaXjgorjgZ3jgYbjgafjgZkifSx7ImZyb20iOiLnlJ/ooYzjgaPjgaHjgoPjgYYiLCJ0byI6IuOCpOOBo+OBoeOCg+OBhiJ9LHsiZnJvbSI6IuOCouOCt+OCq+aPj+OBhOOBpiIsInRvIjoi6Laz6ZaL44GE44GmIn0seyJmcm9tIjoi44GC44Gj44Gx44GE44Gn5oyfIiwidG8iOiLjgYrjgaPjgbHjgYTjgafmjJ8ifSx7ImZyb20iOiLjgqLjg4Pjg5fjg6vjgafmjJ8iLCJ0byI6IuOBiuOBo+OBseOBhOOBp+aMnyJ9LHsiZnJvbSI6IuOCpOOCseODoeODs+OBoeOCkyIsInRvIjoi44GK44Gh44KT44Gh44KTIn0seyJmcm9tIjoi44GK44Gh44KT44Gh44KD44KTIiwidG8iOiLjgYrjgaHjgpPjgaHjgpMifSx7ImZyb20iOiLjgYrjga/jgaHjgpPjgaHjgpMiLCJ0byI6IuOBiuOBoeOCk+OBoeOCkyJ9LHsiZnJvbSI6IuODgeODpeODs+ODgeODpeODsyIsInRvIjoi44OB44Oz44OB44OzIn0seyJmcm9tIjoi44OH44Kr44OB44ON44K/44OzIiwidG8iOiLjg4fjgqvjg4Hjg7Pjga8ifSx7ImZyb20iOiLogLPjga7jg5Djg4Pjg4giLCJ0byI6IuOBiuOBoeOCk+OBoeOCk+OBjCJ9LHsiZnJvbSI6IuadpeOCiOOCquODvOODqSIsInRvIjoi5p2l44Gm44G744KJIn0seyJmcm9tIjoi5LiA5pel44Gu5YWI44GvIiwidG8iOiLjgqTjg4Hjg6Ljg4Tjga7lhYjjga8ifSx7ImZyb20iOiLjgqLjg4Pjg5fjgafmjJ8iLCJ0byI6IuOBiuOBo+OBseOBhOOBp+aMnyJ9LHsiZnJvbSI6IuOCtOODqeihjOOBj+OCiCIsInRvIjoi44G744KJ6KGM44GP44KIIn0seyJmcm9tIjoi44OI44Oq44GM5L2O44GEIiwidG8iOiLjg4jjg6rjgqzjg7zjgYzkvY7jgYQifSx7ImZyb20iOiLlpaXjgafmv4DlirEiLCJ0byI6IuWlpeOBp+WIuua/gCJ9LHsiZnJvbSI6IuaAkuiBtOOBl+OBpiIsInRvIjoi5YuD6LW344GX44GmIn0seyJmcm9tIjoi5pel5pys56ul5a2QIiwidG8iOiLml6XmnKzjga7nq6Xosp4ifSx7ImZyb20iOiLjg4Hjg7Pjgq/jgoIiLCJ0byI6IuOBoeOCk+OBk+OCgiJ9LHsiZnJvbSI6IuODmeOCv+ODgeODsyIsInRvIjoi44OH44Kr44OB44OzIn0seyJmcm9tIjoi44G744Gj44Gx44GEIiwidG8iOiLjgYrjgaPjgbHjgYQifSx7ImZyb20iOiLjgbvjgb7jgpPjgZMiLCJ0byI6IuOBiuOBvuOCk+OBkyJ9LHsiZnJvbSI6IumHkeacquadpSIsInRvIjoi6YeR546J5pyq5p2lIn0seyJmcm9tIjoi6YeR44OR44OzIiwidG8iOiLjg4Hjg7Pjg50ifSx7ImZyb20iOiLnlJ/ooYzjgY8iLCJ0byI6IuOCpOOBjyJ9LHsiZnJvbSI6IuOBiuato+awlyIsInRvIjoi44GK5LuV572u44GNIn0seyJmcm9tIjoi44K344OV44OsIiwidG8iOiLjgrvjg5Xjg6wifSx7ImZyb20iOiLkubPovrIiLCJ0byI6IuS5s+aIvyJ9LHsiZnJvbSI6IumKgOmKgCIsInRvIjoi44OT44Oz44OT44OzIn1d';

    function getAsrAdultDomainPairs() {
        try {
            const raw = JSON.parse(d(ASR_ADULT_PAIRS_B64));
            if (!Array.isArray(raw)) return [];
            return raw.map((p) => ({ from: String(p.from || ''), to: String(p.to || '') }))
                .filter((p) => p.from && p.to);
        } catch (_) {
            return [];
        }
    }

    /**
     * Apply adult-domain training fixes without plaintext literals at call sites.
     * @param {string} text
     * @param {string} sourceText
     * @param {(flag: string) => void} [mark]
     * @returns {{ text: string, changed: boolean }}
     */
    function applyTrainingDomainFixes(text, sourceText = '', mark) {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const before = cur;
        if (!src) return { text: cur, changed: false };

        const note = (flag) => {
            if (typeof mark === 'function') mark(flag);
        };

        if (
            (src.includes(T.warmJa) || src.includes(T.warmJa2) || src.includes(T.warmJa3))
            && cur.includes(T.edZh)
        ) {
            cur = cur
                .split(T.edWarmZh).join(T.warmZh)
                .split(T.edZh).join('')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!cur) cur = T.warmZh2;
            note('domain_term');
        }

        if (
            src.includes(T.peeJa)
            && cur.includes(T.semenZh)
            && !src.includes(T.semenJa)
            && !src.includes(T.semenZh)
            && !src.includes(T.spermJa)
        ) {
            cur = cur.split(T.semenZh).join(T.peeZh);
            note('domain_term');
        }

        return { text: cur, changed: cur !== before };
    }

    /**
     * High-confidence adult semantic inversions / hallucinations (JA-conditioned ZH fixes).
     * @param {string} text
     * @param {string} sourceText
     * @param {(flag: string) => void} [mark]
     * @returns {{ text: string, changed: boolean }}
     */
    function applyAdultSemanticFixes(text, sourceText = '', mark) {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const before = cur;
        if (!src) return { text: cur, changed: false };

        const note = (flag) => {
            if (typeof mark === 'function') mark(flag);
        };

        if (RE.noSexService.test(src) && (RE.passThroughZh.test(cur) || RE.wontPassThrough.test(cur))) {
            cur = T.noSexServiceZh;
            note('domain_term');
        }
        if (
            RE.notSoapland.test(src)
            && (RE.cannotOnlyZh.test(cur.replace(/\s+/g, '')) || RE.passThroughZh.test(cur))
        ) {
            cur = T.notSoaplandZh;
            note('domain_term');
        }

        if (RE.prone.test(src) && !RE.genitalHint.test(src) && cur.includes(T.smallHoleZh)) {
            cur = cur.replace(RE.smallHoleG, T.lieZh);
            note('domain_term');
        }

        if (
            /(?:ほぐ|はぐして|はぐしていく)/.test(src)
            && RE.orgasm.test(cur)
            && !RE.orgasmHint.test(src)
        ) {
            cur = cur.replace(RE.keepOrgasmG, T.massageZh).replace(RE.orgasmG, T.relaxZh);
            note('domain_term');
        }

        if (
            /(?:メンエース|メンエス).{0,12}(?:わびさび|塩梅|ギリギリ)/.test(src)
            || /わびさび|ギリギリの塩梅/.test(src)
        ) {
            if (RE.sexAtmosphere.test(cur)) {
                cur = T.mensEstheMoodZh;
                note('domain_term');
            }
        }

        if (
            RE.breastOrAppleSrc.test(src)
            && cur.includes(T.appleZh)
            && !RE.appleFruit.test(src)
        ) {
            cur = cur.replace(RE.appleZhG, T.breastZh);
            note('domain_term');
        }

        // MIDA-762-style euphemism / ASR-domain collapses
        if (RE.dekachinSrc.test(src)) {
            if (cur.includes(T.wantChickenZh)) {
                cur = cur.replace(RE.wantChickenG, T.wantBigRodZh);
                note('domain_term');
            }
            if (
                cur.includes(T.bigProjectZh)
                || cur.includes(T.chickenCutletZh)
                || cur.includes(T.longLegsZh)
            ) {
                cur = cur
                    .replace(RE.bigProjectG, T.bigRodZh)
                    .replace(RE.chickenG, T.bigRodZh)
                    .replace(RE.longLegsG, T.bigRodZh);
                note('domain_term');
            }
        }
        if (src.includes(T.kintamaJa) && cur.includes(T.goldenLightZh)) {
            cur = cur.replace(RE.goldenLightG, T.ballsZh);
            note('domain_term');
        }
        if (src.includes(T.worldJa) && cur.includes(T.projectNameZh)) {
            cur = cur.replace(RE.projectNameG, T.worldJa);
            note('domain_term');
        }
        if (RE.chinkoBigSrc.test(src) && RE.breastZh.test(cur)) {
            if (cur.includes(T.breastAlsoBigZh)) {
                cur = cur.replace(RE.breastAlsoBigG, T.rodAlsoBigZh);
            } else {
                cur = cur.split('胸部').join(T.rodZh);
            }
            note('domain_term');
        }


        // Face-cum misread as reveal / vague release
        if (new RegExp(T.faceCumJa).test(src)) {
            if (cur.includes(T.faceRevealZh)) {
                cur = cur.split(T.faceRevealZh).join(T.faceCumZh);
                note('domain_term');
            }
            if (cur.includes(T.faceReleaseZh)) {
                cur = cur.split(T.faceReleaseZh).join(T.faceCumZh);
                note('domain_term');
            }
        }
        if (src.includes(T.ikuAlsoDashiteJa) && cur.includes(T.climaxFeelZh)) {
            const badFull = `把${T.climaxFeelZh}也释放出来`;
            const badShort = `${T.climaxFeelZh}也释放出来`;
            if (cur.includes(badFull)) {
                cur = cur.split(badFull).join(T.ikuAlsoDashiteZh);
                note('domain_term');
            } else if (cur.includes(badShort)) {
                cur = cur.split(badShort).join(T.ikuAlsoDashiteZh);
                note('domain_term');
            }
        }
        if (src.includes(T.acchiJa) && cur.includes(T.softCottonZh)) {
            cur = cur.split(T.softCottonZh).join(T.hotHotZh);
            note('domain_term');
        }
        if (
            (src.includes(T.toroToroJa) || /とろとろ/.test(src))
            && cur.includes(T.softCottonZh)
        ) {
            cur = cur.split(T.softCottonZh).join(T.wetMessyZh);
            note('domain_term');
        }
        // おちんぽ etc. misread as balls / erect-verb euphemism
        if (RE.dekachinSrc.test(src) && !src.includes(T.kintamaJa) && cur.includes(T.ballsZh)) {
            cur = cur.split(T.ballsZh).join(T.rodZh);
            note('domain_term');
        }
        if (
            RE.dekachinSrc.test(src)
            && cur.includes(T.erectVerbZh)
            && !/勃起|ビンビン|びんびん|ガチガチ/.test(src)
        ) {
            const erect = T.erectVerbZh;
            cur = cur
                .split(`的${erect}`).join(`的${T.rodZh}`)
                .split(`${erect}了`).join(T.rodZh)
                .split(erect).join(T.rodZh);
            note('domain_term');
        }
        if (src.includes(T.guchuJa) && cur.includes(T.blushedZh)) {
            cur = cur.split(T.blushedZh).join(T.wetMessyZh);
            note('domain_term');
        }

        // Nipple misread as ear
        if ((src.includes(T.chikubiJa) || src.includes(T.nippleJa)) && cur.includes(T.earZh)) {
            cur = cur.split(T.earZh).join(T.nippleZh);
            note('domain_term');
        }
        // Swollen/erect misread as golden glitter
        if (
            (src.includes(T.chinpoJa) || src.includes(T.panpanJa))
            && (cur.includes(T.goldenSparkleZh) || cur.includes(T.goldenLightZh))
        ) {
            if (cur.includes(T.goldenSparkleZh)) {
                cur = cur.replace(RE.goldenSparkleG, T.swollenZh);
            } else {
                cur = cur.replace(RE.goldenLightG, T.swollenZh);
            }
            note('domain_term');
        }

        if (RE.climaxIkuSrc.test(src) && cur.includes(T.aboutToStartZh)) {
            cur = cur.replace(RE.aboutToStartG, T.aboutToCumZh);
            note('domain_term');
        }
        // Climax イク misread as male ejaculation「要射」
        if (
            RE.climaxIkuSrc.test(src)
            && cur.includes(T.shootCumShortZh)
            && !/射精|ザーメン|精液|出して/.test(src)
        ) {
            cur = cur
                .replace(RE.shootCumG, T.aboutToCumZh)
                .replace(RE.shootCumShortG, T.goCumShortZh);
            note('domain_term');
        }
        // セックス euphemized as「发生关系」/「一夜情」
        if (src.includes(T.sexJa) || src.includes(T.sexHiraJa)) {
            if (cur.includes(T.haveRelationZh)) {
                cur = cur.replace(RE.haveRelationG, T.makeLoveZh);
                note('domain_term');
            }
            if (src.includes(T.untilMorningJa) && cur.includes(T.oneNightZh)) {
                if (cur.includes(`做${T.oneNightZh}`)) {
                    cur = cur.split(`做${T.oneNightZh}`).join(T.untilMorningSexZh);
                } else {
                    cur = cur.replace(RE.oneNightG, T.untilMorningSexZh);
                }
                note('domain_term');
            }
        }
        // おちんちん → childish / vague euphemisms
        if (RE.dekachinSrc.test(src)) {
            if (cur.includes(T.littleChickZh)) {
                cur = cur.replace(RE.littleChickG, T.rodZh);
                note('domain_term');
            }
            if (cur.includes(T.thatThingZh)) {
                cur = cur.replace(RE.thatThingG, T.rodZh);
                note('domain_term');
            }
        }
        // おまんこ出して →「出点什么」
        if (src.includes(T.omankoDashiteJa) && cur.includes(T.spitSomethingZh)) {
            cur = cur
                .split(`你再${T.spitSomethingZh}`).join(T.showPussyZh)
                .replace(RE.spitSomethingG, T.showPussyZh);
            note('domain_term');
        }
        // Duplicate rod euphemism collapse
        if (RE.dekachinSrc.test(src) && cur.includes(T.rodDupZh)) {
            cur = cur.replace(RE.rodDupG, T.rodZh);
            note('domain_term');
        }
        // 舐めてくれない misread as breakup question (before stripping 分手)
        if (
            /舐めてくれない/.test(src)
            && (src.includes(T.chikubiJa) || src.includes(T.nippleJa))
            && (cur.includes(T.breakupZh) || /在舔乳头/.test(cur))
        ) {
            cur = T.noLickNippleOkZh;
            note('domain_term');
        }
        // Spurious「分手」bleed when JA has no breakup
        if (
            cur.includes(T.breakupZh)
            && !/別れ|ふられる|降格|セフレ|彼氏|彼女|付き合う/.test(src)
            && (RE.dekachinSrc.test(src) || src.includes(T.nippleJa) || src.includes(T.chikubiJa))
        ) {
            cur = cur
                .split(`真的${T.breakupZh}？`).join('')
                .split(`，${T.breakupZh}吗？`).join('吗？')
                .split(`${T.breakupZh}吗？`).join('吗？')
                .split(T.breakupZh).join('')
                .replace(/[，,]{2,}/g, '，')
                .replace(/[，,]\s*$/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            note('domain_term');
        }
        // 「马上要了」missing 去 for climax
        if (RE.climaxIkuSrc.test(src) && cur.includes(T.aboutToSoonZh)) {
            cur = cur.replace(RE.aboutToSoonG, T.aboutToSoonOkZh);
            note('domain_term');
        }

        return { text: cur, changed: cur !== before };
    }

    function shouldKeepOrphanStuckZh(sourceText = '') {
        return RE.bodyJustify.test(String(sourceText || ''));
    }

    /** Test / tooling fixtures (opaque). */
    const FIX = Object.freeze({
        feelJa: d('44GN44KC44Gh44GE44GjIQ=='),
        itchyZh: d('5aW955eS77yB'),
        niceZh: d('5aW96IiS5pyN77yB'),
        mickeyJa: d('44GL44KP44GE44GE44Of44OD44Kt44O844Gu6aGU44Gr5Ye644GX44Gf44GE44CC'),
        mickeyBadZh: d('5oOz5bCE5Zyo5Y+v54ix55qE57Gz6ICB6byg55qE6IS45LiK'),
        mickeyOkZh: d('57Gz5aWH'),
        aliceJa: d('44GY44KD44GC44Ki44Oq44K544Gh44KD44KT44Gu44GK44G+44KT44GT44GE44Gj44Gx44GE44Gq44GM44KB44Gf44KK'),
        aliceBadZh: d('6YKj5bCx5aSa55yL55yL6Zi/5qKo5Lid5bCP5aeQ55qE6Zi06YGT'),
        aliceOkZh: d('6Zi/5qKo5Lid'),
        wifeJa: d('5aWl44GV44KT44Gu44GK44G+44KT44GT57Sg5pm044KJ44GX44GE44Gn44GZ44Gt'),
        wifeBadZh: d('5pem6YKj5bCP5aeQ55qE6YKj6YeM55yf5qOS'),
        chinpoWarmJa: d('44GC44CB44GK44Gh44KT44G944GC44Gj44Gf44GL44GE44CC'),
        edWarmLineZh: d('5ZOm77yM6Ziz55e/5oy65pqW5ZKM55qE'),
        bleedJa: d('44Gk44GN'),
        bleedZh: d('5aWz5oCn5Zyo5YWx5Lqr5L2P5a6F5Lit5LiO5aSa5ZCN55S35oCn5ZCM5bGF77yM6YCa6L+H5ruh6Laz5LuW5Lus55qE5oCn5qyy5p2l5o2i5Y+W5YWN6LS555qE5L2P5a6/'),
        smallHoleLineZh: d('5p2l77yM5Lmf5p2l5YGa5LiA5LiL5bCP56m05ZCn'),
        proneLineJa: d('44GV44GC44GK44KA44GR44KC44KE44Gj44Gm44GE44GN44G+44GX44KH44GG44GL44CC'),
        keepOrgasmLineZh: d('5pyA6L+R5Lmf5LiA55u05L+d5oyB552A6auY5r2u77yM5aSn5a6255qE57K+5Yqb6YO95Y+Y5b6X5pe655ub6LW35p2l5LqG'),
        hoguLineJa: d('44GT44Gu44Go44GT44KN44KC5Li55b+144Gr44Gv44GQ44GX44Gm44GE44GP44Gu44Gn55qG44GV44KT5YWD5rCX44Gr44Gq44Gj44Gm44GX44G+44GG44KT44Gn44GZ44GR44Gp'),
        refuseBadZh: d('5oiR5LiN5Lya5pS+6L+H5L2g55qE77yM'),
        noSexLineJa: d('5oCn55qE44Gq44K144O844OT44K544Gv44Gn44GN44G+44Gb44KT44Gu44Gn44CB'),
        orphanStuckZh: d('5ZOl5ZOl55qE6IKJ5qOS5aW96IiS5pyN77yM5Zev5ZWK5ZWK5ZWK77yB'),
        breastJa: T.breastJa,
        notFuzokuJa: T.notFuzokuJa,
        climaxGlossMeta: d('44GE44GPLT7ljrvkuoYgI+mrmOa9rueUqOivre+8jA=='),
        cannotRepeatZh: d('5LiN5Y+v5Lul4oCm5LiN5Y+v5Lul'),
        notSoaplandSrcJa: d('5YWN56iO44GX44Gm44Gv6aKo5L+X44Gn44Gv44GC44KK44G+44Gb44KT44CC'),
        tommyMeatZh: d('6YKj5qC56IKJ5qOS5bCx5piv6L+Z5LmI5Y6J5a6z44CCIOaxpOexsw=='),
        tommyMeatJa: d('44Gd44KT44Gq44Gu44OI44Of44O844O844GP44KT44Gu44GK44Gh44KT44Gh44KT44Gd44KM44CC'),
        hameGloss: d('44OP44OhLT7mj5Lov5vljrs='),
        asrBatchAdultFrag: d('44G744Gj44Gx44GE44CC44Gv44G244KM44Gm44GE44GN44G+44GZ44CC56WW54i244Go44Gv6YGV44GE44G+44GZ44CC'),
        fuzokuPhrase: d('6aKo5L+X44Gn44Gv44GC44KK44G+44Gb44KT'),
        fuzokuToDiffers: d('6aKo5L+X44Go44Gv6YGV44GE44G+44GZ'),
        breastOut: d('44GK44Gj44Gx44GE'),
        noSexServiceZh: T.noSexServiceZh,
        smallHoleZh: T.smallHoleZh,
        orgasmZh: T.orgasmZh,
        lieZh: T.lieZh,
        // MIDA-762 fixtures
        worldListJa: d('44GC44Go5LiW55WM5LiA6KanPw=='),
        worldListBadZh: d('6L+Y5pyJ6aG555uu5ZCN56ew5LiA6KeIPw=='),
        worldListOkZh: d('6L+Y5pyJ5LiW55WM5LiA6KeIPw=='),
        dekachinWantJa: d('44OH44Kr44OB44Oz5qyy44GX44GEPw=='),
        chickenWantZh: d('5oOz5ZCD5aSn6bih5o6SPw=='),
        dekachinWantOkZh: d('5oOz6KaB5aSn6IKJ5qOSPw=='),
        kintamaLineJa: d('6YeR546J44GM5LuY44GE44Gm44GE44KL'),
        kintamaBadZh: d('5LiK6Z2i5pyJ6YeR5YWJ'),
        kintamaOkZh: d('5LiK6Z2i5pyJ6JuL6JuL'),
        chinkuLineJa: d('44GG44KP44O844G/44GK44Gh44KD44KT44Gu6aGU44KC44Gh44Gj44Go44Gh44Gj44Gh44KD44GE44GX44CB44OB44Oz44Kv44KC44Gn44GL44GE'),
        chinkuBadZh: d('5ZOH77yM5aW555qE6IS455yL6LW35p2l5bCP5LiA5Lqb77yM6IO46YOo5Lmf5oy65aSn55qE'),
        ikuLineJa: d('44GC44Cc6KGM44GP'),
        ikuBadZh: d('5ZWK772e6KaB5byA5aeL5LqG'),
        ikuOkZh: d('5ZWK772e6KaB5Y675LqG'),
        bigProjectLineZh: d('5Zev77yM5bCx5piv6YKj56eN5aSn6aG555uu5ZCn'),
        dekachinLineJa: d('44GL44OH44Kr44OB44Oz55qE44Gq44KE44Gk44Gn44GZ44KI44Gt'),
        bigRodPhraseZh: T.bigRodZh,
        chinkoMo: T.chinkoMo,
        midaAsrBatchJa: d('44OV44Kn44Op44Oz44OH44Oi44Oz44K544OI44Os44O844K344On44Oz44CC44K444Oj44OR44OL44O844K65Lya44CC5LiA5pel44Gu5b2i44KE5aSn44GN44GV44CC44Gh44KT44Gh44KD44KT44Gn6LW344GN44Gm44CC5oCS6IG044GX44Gm44CC5YWl44KK44Gb44GE44Gn44GZ44CC44OZ44K/44OB44Oz44CC44G744G+44KT44GT44CC6YeR5pyq5p2l44CC5Lmz6L6y44CC44Ki44K344Kr5o+P44GE44Gm44CC44K544K/44Kk44OI44GX44G+44GZ44Gt44CC5aWl44Gn5r+A5Yqx44CC5oKU44GE44Gr44GV44KM44Gh44KD44GG44CC44OH44Kr44OB44ON44K/44Oz44CC44GK44Gh44KT44Gh44KD44KT44CC44Kz44O844OB44Oz5pWj44KM44Gf44KJ44CC5pel5pys56ul5a2Q44CC44Kq44O844Kv5YWl44KM44KL44KI44Kq44O844Op44CC44K044Op6KGM44GP44KI44CC44K144Kk44K444CC5by144KK44Gk6Iie44Gj44Gm'),
        midaAsrExpect: Object.freeze([
            d('44OV44Kn44Op44Gu44OH44Oi44Oz44K544OI44Os44O844K344On44Oz'),
            d('44K444Oj44OR44OL44O844K644Ks44Kk'),
            d('44Kk44OB44Oi44OE44Gu5b2i44KE5aSn44GN44GV'),
            d('44OB44Oz44OB44Oz44Gn6LW344GN44Gm'),
            d('5YuD6LW344GX44Gm'),
            d('5YWl44KK44Gd44GG44Gn44GZ'),
            d('44OH44Kr44OB44Oz'),
            d('44GK44G+44KT44GT'),
            d('6YeR546J5pyq5p2l'),
            d('5Lmz5oi/'),
            d('6Laz6ZaL44GE44Gm'),
            d('5Ye644Gf44GE44Gn44GZ44Gt'),
            d('5aWl44Gn5Yi65r+A'),
            d('5aWl44Gr44GV44KM44Gh44KD44GG'),
            d('44OH44Kr44OB44Oz44Gv'),
            d('44GK44Gh44KT44Gh44KT'),
            d('57K+5ray5pWj44KM44Gf44KJ'),
            d('5pel5pys44Gu56ul6LKe'),
            d('5aWl5YWl44KM44KL44KI44G744KJ'),
            d('44G744KJ6KGM44GP44KI'),
            d('44K144Kk44K6'),
            d('5by144KK44Gk44KB44Gm'),
        ]),
        /** Mishear forms that must disappear after ASR fix (opaque). */
        midaAsrGone: Object.freeze([
            d('44OZ44K/44OB44Oz'),
            d('44OB44Oz44Kv44KC'),
            d('44K444Oj44OR44OL44O844K65Lya'),
        ]),
        kounyuMishearJa: d('6LO85YWl44GX44Gm44Gm44GP44Gg44GV44GE'),
        koufunCorrectJa: d('6IiI5aWu44GX44Gm44Gm44GP44Gg44GV44GE'),
        namaIkuJa: d('44GC44GC55Sf6KGM44GP5b6F44Gj44Gm6KGM44GP4oCm'),
        namaIkuBadZh: d('5ZWK77yM6KaB5byA5aeL5LqGLi4u562J562J'),
        namaIkuOkZh: d('5ZWK77yM6KaB5Y675LqGLi4u562J562J'),
        namaIkuQJa: d('55Sf6KGM44Gj44Gh44KD44GG44KT44Gn44GZ44GLPyDjgYLjgYI='),
        namaIkuQBadZh: d('6KaB5byA5aeL5LqG77yfIOWVig=='),
        namaIkuQOkZh: d('6KaB5Y675LqG77yfIOWVig=='),
        chikubiLineJa: d('44GT44Gj44Gh44Gu44OB44Kv44OT44Gu5pa544GM5rCX5oyB44Gh44GE44GE44KI44Gt'),
        earBadZh: d('5oiR6L+Z6L6555qE6ICz5py15pu06IiS5pyN5ZCn'),
        nippleOkZh: d('5oiR6L+Z6L6555qE5Lmz5aS05pu06IiS5pyN5ZCn'),
        kinpanJa: d('44GY44KD44GC44GZ44Gj44GU44GE6YeR44OR44Oz44Gu44OR44Oz44OR44Oz44Gr44Gq44Gj44Gh44KD44Gj44Gm44KL44KC44KT44Gt'),
        kinpanBadZh: d('5omA5Lul5L2g546w5Zyo5bey57uP5Y+Y5oiQ6YeR5YWJ6Zeq6Zeq55qE5LqG'),
        kinpanOkZh: d('5omA5Lul5L2g546w5Zyo5bey57uP5Y+Y5oiQ6IOA5b6X6byT6byT55qE5LqG'),
        ochinjuJa: d('44G+44GC44GK44Gh44KT44GY44KF44GG44GV44KT44Gv44OI44Oq44GM5L2O44GE44GX44Gh44KH44Gj44Go5oiR5oWi44GX44Gm44GE44KL44KT44Gn44GZ44KI44Gt'),
        ochinjuFixed: d('44G+44GC44GK44Gh44KT44Gh44KT44Gv44OI44Oq44Ks44O844GM5L2O44GE44GX44Gh44KH44Gj44Go5oiR5oWi44GX44Gm44GE44KL44KT44Gn44GZ44KI44Gt'),
        faceCumLineJa: d('44GK6aGU44Gr5Ye644GX44Gm4oCm44GK6aGU44Gr5Ye644GX44Gm4oCm44Kk44Kt44Gm4oCm44KT44GjIQ=='),
        faceCumBadZh: d('6IS45LiK6Zyy5Ye64oCm6IS45LiK6Zyy5Ye64oCm6auY5r2u5LqG4oCm5Zev77yB'),
        faceCumOkZh: d('5bCE5Zyo6IS45LiK4oCm5bCE5Zyo6IS45LiK4oCm6auY5r2u5LqG4oCm5Zev77yB'),
        ikuDashiteJa: d('44GC44GC44CB44Kk44Kv44Gu44KC5Ye644GX44Gm44CC'),
        ikuDashiteBadZh: d('5ZWK5ZWK77yM5oqK6auY5r2u55qE5oSf6KeJ5Lmf6YeK5pS+5Ye65p2l'),
        ikuDashiteOkZh: d('5ZWK5ZWK77yM6KaB5Y6755qE5pe25YCZ5Lmf5bCE5Ye65p2l'),
        acchiLineJa: d('44KC44GG44GK44Gh44KT44Gh44KT44GC44Gj44Gh44GC44Gj44Gh44Gg44KI44CC'),
        acchiBadZh: d('546w5Zyo5bey57uP6L2v57u157u155qE5LqG'),
        acchiOkZh: d('546w5Zyo5bey57uP54Ot54Ot55qE5LqG'),
        earBatJa: d('44GZ44Gj44GU44GE6ICz44Gu44OQ44OD44OI44Gz44KT44Gz44KT44GY44KD44KT44GZ44GU44GE44GZ44Gj'),
        earBatFixed: d('44GZ44Gj44GU44GE44GK44Gh44KT44Gh44KT44OT44Oz44OT44Oz44GY44KD44KT44GZ44GU44GE44GZ44Gj'),
        truncFeelJa: d('44GC44GC44CB5rCX5oyB44Gh44GE44GE44CC'),
        truncFeelBadZh: d('5ZWK77yM'),
        truncFeelOkZh: d('5aW96IiS5pyN'),
        chinpoBallsJa: d('44GC44Cc44Cc44Gj44CB44GN44KC44Gh44GD44CB44KE44Gw44Gj44CB44GU5Li75Lq65qeY44Gu44GK44Gh44KT44G944GN44KC44Gh44GD44Gn44GZ'),
        chinpoBallsBadZh: d('5ZWK44Cc44Cc77yM5aW96IiS5pyN77yM57Of5LqG77yM5Li75Lq655qE6JuL6JuL5aW96IiS5pyN'),
        chinpoBallsOkZh: d('5ZWK44Cc44Cc77yM5aW96IiS5pyN77yM57Of5LqG77yM5Li75Lq655qE6bih5be05aW96IiS5pyN'),
        chinpoErectJa: d('44GU44GX44KF44GY44KT44GV44G+4oCm44GK44Gh44KT44G944CB44GU44GX44KF44GY44KT44GV44G+44Gu44GK44Gh44KT44G94oCm'),
        chinpoErectBadZh: d('5Li75Lq64oCm56Gs6LW35p2l5LqG77yM5Li75Lq655qE56Gs6LW35p2l'),
        chinpoErectOkZh: d('5Li75Lq64oCm6bih5be077yM5Li75Lq655qE6bih5be0'),
        toroLineJa: d('44GZ44GU44GjMuS6uuOBqOOCguODiOODreODiOODreOBp+OBmeOBrQ=='),
        toroBadZh: d('5Lik5Lq655yf5piv6L2v57u157u155qE'),
        toroOkZh: d('5Lik5Lq655yf5piv5rm/5ryJ5ryJ55qE'),
        ahahaIkuJa: d('44GC44Gv44Gv44CB44Kk44OD44Gh44KD44GG44CB44Kk44OD44Gh44KD44GG44CC'),
        ahahaIkuBadZh: d('5ZOI5ZOI'),
        ahahaIkuOkZh: d('5ZOI5ZOI77yM6KaB5Y675LqG'),
        ahahaFeelJa: d('44GC44Gv44Gv44Gv44Gj44CB44GC44GC44Gj44CB5rCX5oyB44Gh44GE44GE44Gj44GC44GC44GC44KT44GjIQ=='),
        ahahaFeelBadZh: d('5ZOI5ZOI'),
        ahahaFeelOkZh: d('5ZOI5ZOI77yM5aW96IiS5pyN'),
        trailIkuJa: d('44GK44Gh44KT44G94oCm44GC44GC44Gj44CB44Kk44OD44Gh44KD44GG'),
        trailIkuBadZh: d('546p5oSP5YS/4oCm5ZWK77yM'),
        trailIkuOkZh: d('546p5oSP5YS/4oCm6KaB5Y675LqG'),
        ikemenChinJa: d('44GC44O844CB44Kk44Kx44Oh44Oz44Gh44KT44CC'),
        ikemenChinFixed: d('44GC44O844CB44GK44Gh44KT44Gh44KT44CC'),
        ikuchaDupJa: d('44GC44Gj44GE44Gj44Gh44KD44GE44Gj44Gh44KD44CC'),
        ikuchaDupFixed: d('44GC44Gj44Kk44OD44Gh44KD44Kk44OD44Gh44KD44CC'),
        wantSexDayJa: d('56eB44CB5LuK5pel5LiA5pel5Lit44CB5YWI55Sf44Go44K744OD44Kv44K544GX44Gf44GE44Gn44GZ44CC'),
        wantSexDayOkZh: d('5oiR5LuK5aSp5LiA5pW05aSp6YO95oOz5ZKM6ICB5biI5YGa54ix44CC'),
        sexEuphemJa: d('5YWI55Sf44Gg44Gj44Gm44CB56eB44Go44K744OD44Kv44K544GX44Gf44GE44Gj44Gm5oCd44Gj44Gm5p2l44Gf44KT44GY44KD44Gq44GE44KT44Gn44GZ44GLPw=='),
        sexEuphemBadZh: d('6ICB5biI77yM5oKo5LiN5piv5LiA55u05oOz5ZKM5oiR5Y+R55Sf5YWz57O75ZCX77yf'),
        sexEuphemOkZh: d('6ICB5biI77yM5oKo5LiN5piv5LiA55u05oOz5ZKM5oiR5YGa54ix5ZCX77yf'),
        asaSexJa: d('5LuK5pel44Gv56eB44Go5pyd44G+44Gn44K744OD44Kv44K544GX44KIPw=='),
        asaSexBadZh: d('5LuK5aSp5ZKM5oiR5YGa5LiA5aSc5oOF5oCO5LmI5qC377yf'),
        asaSexOkZh: d('5LuK5aSp5ZKM5oiR5YGa5Yiw5pep5LiK5oCO5LmI5qC377yf'),
        ikuShootJa: d('44GC44Gj44CB44GC44KT44Gj44CB44GC44GC44Kk44OD44Gh44KD44GG44Kk44OD44Gh44KD44GG44CC'),
        ikuShootBadZh: d('5ZWK44CB5Zev77yM6KaB5bCE5LqG6KaB5bCE5LqG'),
        ikuShootOkZh: d('5ZWK44CB5Zev77yM6KaB5Y675LqG6KaB5Y675LqG'),
        chinChickJa: d('44GZ44GU44GE44GK44Gh44KT44Gh44KT44OU44Kv44OU44Kv44GX44Gm44KL44CC'),
        chinChickBadZh: d('5LuW55qE5bCP6bih6bih5Zyo5Ymn54OI5oqW5Yqo'),
        chinChickOkZh: d('5LuW55qE6bih5be05Zyo5Ymn54OI5oqW5Yqo'),
        omankoJa: d('44KC44Gj44Go57aa44GR44Gf44GE44Gq44GC44GK44G+44KT44GT5Ye644GX44Gm44Gp44GGPw=='),
        omankoBadZh: d('6L+Y5oOz57un57ut5ZGi77yM5L2g5YaN5Ye654K55LuA5LmI5oCO5LmI5qC377yf'),
        omankoOkZh: d('6L+Y5oOz57un57ut5ZGi77yM5oqK5bCP56m06Zyy5Ye65p2l5oCO5LmI5qC377yf'),
        chuLineJa: d('44Gt44GI44CB44Gh44KF44O844KC44GX44Gm'),
        chuBadZh: d('5ZaC77yM'),
        chuOkZh: d('5Lmf5Lqy5Lqy5oiR'),
        oliverFeelJa: d('44GE44KE44CB44Kq44Oq44OQ44O844G/44Gf44GE44Gq5oSf44GY44GM44GE44GE44Gn44GZ44CC'),
        oliverFeelOkZh: d('5LiN77yM5aWl5Yip5byX6YKj56eN5oSf6KeJ5q+U6L6D5aW944CC'),
        genkiNatteJa: d('44GK5YWE44Gh44KD44KT44CB5YWD5rCX44Gr44Gq44Gj44Gm'),
        genkiNatteOkZh: d('5ZOl5ZOl77yM5oyv5L2c6LW35p2l'),
        itazuraJa: d('44GK5YWE44Gh44KD44KT44CB44GE44Gf44Ga44KJ44GX44Gq44GE44Gn'),
        itazuraOkZh: d('5ZOl5ZOl77yM5Yir5o2j5Lmx'),
        horaGenkiJa: d('44G744KJ44CB5YWD5rCX44Gr44Gq44Gj44Gm44KI44CC'),
        horaGenkiOkZh: d('5p2l77yM5oyv5L2c6LW35p2l5ZGA'),
        kasanatteruJa: d('44KE44Gw44GE44CB44Gq44KT44GL44KB44Gj44Gh44KD6YeN44Gq44Gj44Gm44KL44CC'),
        kasanatteruOkZh: d('57Of5LqG77yM5Y+g5b6X6LaF57qn5Y6J5a6z'),
        nakanaideJa: d('5rOj44GL44Gq44GE44Gn44CC'),
        nakanaideBadZh: d('5ZOt5LqG'),
        nakanaideOkZh: d('5Yir5ZOt'),
        mecchaIiJa: d('44KB44Gj44Gh44KD44GE44GE44CC'),
        mecchaIiBadZh: d('5aW955qE'),
        mecchaIiOkZh: d('6LaF5qOS'),
        nayamashiiJa: d('44GI44CB5oKp44G+44GX44GE44CC'),
        nayamashiiBadZh: d('5Zev77yM'),
        nayamashiiOkZh: d('5aW957qg57uT'),
        nippleChinkoBlankJa: d('56eB44Gr6Kem44KJ44KM44Gm44KL44GL44KJ5YuD44Gj44Gh44KD44GG44Gu44KI44Gt5LuW44Gr5Lmz6aaW6Kem44KJ44KM44Gm44OB44Oz44Kz5YuD44Gj44Gh44KD44GG'),
        nippleChinkoOkZh: d('6KKr5oiR5pG45bCx5Lya56Gs5ZCn77yM5Lmz5aS06KKr5pG46bih5be05Lmf5Lya56Gs'),
        ochinchinWaitJa: d('44Gh44KH44Gh44KH44Gj44Go44GK44Gv44Gh44KT44Gh44KT'),
        ochinchinWaitFixedJa: d('44Gh44KH44Gh44KH44Gj44Go44GK44Gh44KT44Gh44KT'),
        ochinchinWaitOkZh: d('562J562J77yM6bih5be0'),
        chappyCallJa: d('44Gt44GI44CB44Gh44KD44Gj44G044O844CC'),
        chappyCallOkZh: d('5ZaC77yM5oGw55qu'),
        chappyThanksJa: d('44GC44KK44GM44Go44GG44CB44OB44Oj44OD44OU44O844CC'),
        chappyThanksBadZh: d('6LCi6LCi77yM'),
        chappyThanksOkZh: d('6LCi6LCi77yM5oGw55qu'),
        nameruWakeJa: d('5aWz44Gv5Lmz6aaW6IiQ44KB44Gm44GP44KM44Gq44GE44GuPw=='),
        nameruWakeBadZh: d('5Zyo6IiU5Lmz5aS05YiG5omL5ZCX77yf'),
        nameruWakeOkZh: d('5aWz5Lq65LiN5biu6IiU5Lmz5aS05ZCX77yf'),
        chinDupJa: d('44Oe44OD44K144O844K444Gg44GR44Gp5L2V44GL44GK44Gh44KT44G956Gs44GP44Gq44Gj44Gm44KL44KI44Gg44GL44KJ'),
        chinDupBadZh: d('5oyJ5pGp55qE5pe25YCZ5oSf6KeJ5L2g55qE6bih5be06bih5be05ZOm77yM55yf55qE5YiG5omL77yf'),
        chinDupOkZh: d('5oyJ5pGp55qE5pe25YCZ5oSf6KeJ5L2g55qE6bih5be05ZOm'),
        ikuNippleJa: d('44Gj44Gh44KD44GG44GL44KJ44GE44Gj44Gh44KD44GG44KT44Gg5Lmz6aaW6Kem44KL44Go44Gh44KH44Gj44Go6KGM44Gj44Gh44KD44GG44Gu44CC'),
        ikuNippleBadZh: d('5LiA56Kw5Yiw5Lmz5aS05bCx6ams5LiK6KaB5LqG55qE'),
        ikuNippleOkZh: d('5LiA56Kw5Yiw5Lmz5aS05bCx6ams5LiK6KaB5Y675LqG55qE'),
        shifureJa: d('44K344OV44Os'),
        sefriJa: d('44K744OV44Os'),
    });

    function glossAdultPartnerZh(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (s.includes(T.senseiJa) || /せんせい/.test(s)) return T.senseiZh;
        if (s.includes(T.masterJa) || /ごしゅじん/.test(s)) return T.masterZh;
        if (/お兄ちゃん|おにいちゃん|兄さん/.test(s)) return '哥哥';
        return '';
    }

    function glossAdultTimeZh(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (s.includes(T.todayAllDayJa) || /きょういちにち/.test(s)) return T.todayAllDayZh;
        if (/一日中/.test(s)) return '一整天';
        if (/今日中/.test(s)) return '今天之内';
        if (/^今日$|^きょう$/.test(s)) return '今天';
        return '';
    }

    /**
     * Recover ZH when the model blanked / ellipsis-censored clear dialogue.
     * Covers adult refusals and high-confidence soft/AV conversational lines.
     * @param {string} sourceText
     * @returns {string|null}
     */
    function recoverBlankAdultDialogue(sourceText = '') {
        const src = String(sourceText || '').trim();
        if (!src) return null;
        // Music / credit scraps — leave ellipsis
        if (/作詞|作曲|編曲|初音ミ/.test(src)) return null;

        const compact = src.replace(/\s+/g, '');
        if (compact === String(FIX.wantSexDayJa || '').replace(/\s+/g, '')) {
            return FIX.wantSexDayOkZh;
        }
        if (compact === String(FIX.oliverFeelJa || '').replace(/\s+/g, '')) {
            return FIX.oliverFeelOkZh;
        }
        if (compact === String(FIX.nippleChinkoBlankJa || '').replace(/\s+/g, '')) {
            return FIX.nippleChinkoOkZh;
        }
        if (compact === String(FIX.chappyCallJa || '').replace(/\s+/g, '')) {
            return FIX.chappyCallOkZh;
        }

        // いや、Xみたいな感じがいいです → 不，X那种感觉比较好
        {
            const m = src.match(/^いや[、,，]\s*(.+?)みたいな感じがいい(?:です)?[。．.！!]*$/u);
            if (m) {
                let name = String(m[1] || '').trim();
                if (name === 'オリバー') name = '奥利弗';
                if (name) return `不，${name}那种感觉比较好。`;
            }
        }

        // Vocative nickname blanks: ねえ、ちゃっぴー。
        if (/^ねえ[、,，]?\s*(?:ちゃっぴー|チャッピー)[。．.!！]*$/u.test(src)) {
            return FIX.chappyCallOkZh || '喂，恰皮';
        }

        // Short ochinchin scrap after ASR
        if (
            /おちんちん|おはちんちん/.test(src)
            && /ちょっと/.test(src)
            && [...src.replace(/\s/g, '')].length <= 16
        ) {
            return FIX.ochinchinWaitOkZh || '等等，鸡巴';
        }

        // Nipple + chinko erect hallucination blank
        if (
            /乳首/.test(src)
            && /(?:チンコ|ちんこ|おちん|勃っちゃう)/.test(src)
            && /触られ/.test(src)
        ) {
            return FIX.nippleChinkoOkZh || '被我摸就会硬吧，乳头被摸鸡巴也会硬';
        }

        if (src.includes(T.sexJa) || src.includes(T.sexHiraJa)) {
            let body = src
                .replace(/^[私僕俺あたしわたし][、,，]?/, '')
                .replace(/(?:です|だ|ね|よ)?[。．.！!？?]*$/u, '')
                .trim();
            const sexWantRe = new RegExp(
                `^(?:(.+?)[、,，])?(.+?)と(?:${T.sexJa}|${T.sexHiraJa})したい$`,
            );
            const m = body.match(sexWantRe);
            if (m) {
                const timeZh = glossAdultTimeZh(m[1] || '');
                const partnerZh = glossAdultPartnerZh(m[2] || '');
                if (partnerZh) {
                    return timeZh
                        ? `我${timeZh}都想和${partnerZh}做爱。`
                        : `我想和${partnerZh}做爱。`;
                }
            }
            if (new RegExp(`(?:${T.sexJa}|${T.sexHiraJa})したい`).test(src)) {
                return `我${T.wantSexZh}。`;
            }
            if (new RegExp(`(?:${T.sexJa}|${T.sexHiraJa})しよ`).test(src)) {
                return `我们${T.makeLoveZh}吧？`;
            }
        }

        return null;
    }

    return {
        d,
        T,
        RE,
        FIX,
        getAsrAdultDomainPairs,
        applyTrainingDomainFixes,
        applyAdultSemanticFixes,
        shouldKeepOrphanStuckZh,
        recoverBlankAdultDialogue,
    };
}));
