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
        ejaculateZh: d('5bCE57K+'),
        dashiteJa: d('5Ye644GX44Gm'),
        dashichauJa: d('5Ye644Gh44KD44GG'),
        deruyoJa: d('5Ye644KL44KI'),
        derumonJa: d('5Ye644KL44KC44KT'),
        lickNippleZh: d('5Zyo6IiU5Lmz5aS0'),
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
        chinChinHiraJa: d('44Gh44KT44Gh44KT'),
        chikubiJa: d('44OB44Kv44OT'),
        nippleJa: d('5Lmz6aaW'),
        earZh: d('6ICz5py1'),
        nippleZh: d('5Lmz5aS0'),
        goldenSparkleZh: d('6YeR5YWJ6Zeq6Zeq55qE'),
        swollenZh: d('6IOA5b6X6byT6byT55qE'),
        panpanJa: d('44OR44Oz44OR44Oz'),
        chinpoJa: d('44OB44Oz44Od'),
        chinpoHiraJa: d('44Gh44KT44G9'),
        erectVerbZh: d('56Gs6LW35p2l'),
        toroToroJa: d('44OI44Ot44OI44Ot'),
        torottoroJa: d('44Go44KN44Gj44Go44KN'),
        dorodoroJa: d('44OJ44Ot44OD44OJ44Ot'),
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
        tinyChickZh: d('5bCP5bCP6bih6bih'),
        shootCumZh: d('6KaB5bCE5LqG'),
        shootCumShortZh: d('6KaB5bCE'),
        goCumShortZh: d('6KaB5Y67'),
        shotZh: d('5bCE5LqG'),
        cameZh: d('5Y675LqG'),
        fastShotZh: d('5b+r5bCE5LqG'),
        fastCameZh: d('5b+r5Y675LqG'),
        againShotZh: d('5Y+I5bCE5LqG'),
        againCameZh: d('5Y+I5Y675LqG'),
        dontShootZh: d('5LiN6KaB5bCE5LqG'),
        footGrindJa: d('6Laz56m044GQ44KK44GQ44KK44GX44Gm44GP44Gg44GV44GE'),
        footGrindOkZh: d('6K+355So6ISa5pCF5byE'),
        wantInsertRodJa: d('44KT44KA44GK44Gh44KT44Gh44KT5YWl44KM44Gf44GP44Gq44Gj44Gm44GX44G+44Gj44Gf'),
        wantInsertRodOkZh: d('5oOz5oqK6IKJ5qOS5pS+6L+b5Y675LqG'),
        alsoFellaJa: d('44GC44Go44CB44OV44Kn44Op4oCm'),
        alsoFellaOkZh: d('6L+Y5pyJ77yM5Y+j5Lqk4oCm'),
        chinCutJa: d('44Gh44KT44Gh44KT44CB44KC44GG5YiH44Gj44Gm44Gt'),
        chinIkuNeJa: d('44Gh44KT44Gh44KT44CB44KC44GG44Kk44Gj44Gm44Gt'),
        chinIkuNeOkZh: d('6IKJ5qOS77yM5bey57uP6KaB5Y675LqG5ZOm'),
        kichinchinJa: d('44GN44Gh44KT44Gh44KT'),
        kichinchinLineJa: d('44GC4oCm44GN44Gh44KT44Gh44KT4oCm'),
        kichinchinOkZh: d('5ZWK4oCm6IKJ5qOS4oCm'),
        anIkuJa: d('44GC44KT44Gj4oCm44Kk44Kv4oCm'),
        moanHeixiuJa: d('44Gy44G444GP44KP4oCmPw=='),
        goXingZh: d('6KGM'),
        moreLickOkZh: d('5YaN6IiU6IiU4oCm'),
        firstLickOkZh: d('56ys5LiA5qyh6KKr6L+Z5qC36IiU4oCm'),
        dameDameZh: d('5LiN6KaB5LiN6KaB'),
        aboutToOutZh: d('6KaB5Ye65p2l5LqG'),
        againAboutToOutZh: d('5Y+I6KaB5Ye65p2l5LqG'),
        againShootZh: d('5Y+I6KaB5bCE5LqG'),
        patientZh: d('55eF5Lq6'),
        bigOkZh: d('5aW95aSn4oCm'),
        hotZh: d('5aW954Ot'),
        feelGoodStubZh: d('5oSf6KeJ5aW9'),
        feelGoodQZh: d('6IiS5pyN5ZCX77yf'),
        thisFeelQZh: d('6L+Z5Liq77yM6IiS5pyN5ZCX77yf'),
        feelGoodEllZh: d('5aW96IiS5pyN4oCm'),
        feelGoodZh: d('5aW96IiS5pyN'),
        pleaseShootZh: d('6K+35bCE5Ye65p2l5ZCn'),
        againCantShootQZh: d('5Y+I6K+05LiN6IO95bCE5LqG5ZCX4oCm'),
        grandpaAlsoOutBadZh: d('54i354i35Lmf6KaB5Ye65p2l5LqG'),
        grandpaAlsoOutOkZh: d('5Lmf6KaB5Ye65p2l5LqG'),
        juiceLikeJa: d('44GK44GX44KL44Gq44GE44Gf'),
        juiceLikeOkZh: d('5YOP5rGB5ray5LiA5qC34oCm'),
        horaLickJa: d('44G744KJ6IiQ44KB44Gm'),
        horaLickOkZh: d('5p2l77yM6IiU6IiU4oCm'),
        thanksCameBadZh: d('6LCi6LCi5L2g5bCE5LqG'),
        thanksCameOkZh: d('6LCi6LCi5L2g5Y675LqG'),
        omankoDashiteJa: d('44GK44G+44KT44GT5Ye644GX44Gm'),
        spitSomethingZh: d('5Ye654K55LuA5LmI'),
        showPussyZh: d('5oqK5bCP56m06Zyy5Ye65p2l'),
        thatThingZh: d('6YKj5Lic6KW/'),
        rodDupZh: d('6bih5be06bih5be0'),
        breakupZh: d('5YiG5omL'),
        aboutToSoonZh: d('6ams5LiK6KaB5LqG'),
        aboutToSoonOkZh: d('6ams5LiK6KaB5Y675LqG'),
        noLickNippleOkZh: d('5aWz5Lq65LiN5biu6IiU5Lmz5aS05ZCX77yf'),
        chinpoMilkJa: d('44GK44Gh44KT44G944Of44Or44Kv'),
        milkWaterZh: d('5aW25rC0'),
        semenZh: d('57K+5ray'),
        alreadyShotZh: d('5bey57uP5bCE5LqG'),
        alreadyCameZh: d('5bey57uP5Y675LqG'),
        wantShootZh: d('5oOz5bCE'),
        wantGoZh: d('5oOz5Y67'),
        giveMeZh: d('5rGC5L2g57uZ5oiR'),
        cowMilkZh: d('54mb5aW2'),
        hardThingZh: d('56Gs5Lic6KW/'),
        skinHardZh: d('55qu6IKk5LiK55qE56Gs5Lic6KW/'),
        rekindleZh: d('6YeN5rip5pen5oOF'),
        breedingSexZh: d('57mB5q6W5oCn6KGM5Li6'),
        nakadashiSexZh: d('5Lit5Ye65YGa54ix'),
        seedSexZh: d('5pKt56eN5YGa54ix'),
        cameHereZh: d('5p2l5LqG'),
        testicleZh: d('552+5Li4'),
        sexFriendZh: d('54Ku5Y+L'),
        sefriJa: d('44K744OV44Os'),
        nakadashiJa: d('5Lit5Ye644GX'),
        tanetsukeJa: d('56iu5LuY44GR'),
        ugokanaiZh: d('5LiN5Yqo'),
        lickCumOkZh: d('5YaN6KKr6L+Z5qC36IiU5bCx6KaB5bCE5LqG'),
        mountainTopZh: d('5bGx6aG2'),
        angryZh: d('5Y+R5oCS'),
        furiousZh: d('5YuD54S25aSn5oCS'),
        hardOkZh: d('56Gs5LqG'),
        erectJa: d('5YuD6LW3'),
        nakaDashiteJa: d('5Lit44Gr5Ye644GX44Gm'),
        nakaDashiteZh: d('5bCE5Zyo6YeM6Z2i'),
        fellaJa: d('44OV44Kn44Op'),
        demoZh: d('5ryU56S6'),
        demoAltZh: d('56S66IyD'),
        oralServiceZh: d('5Y+j6IWU5pyN5Yqh'),
        oralZh: d('5Y+j5Lqk'),
        kunniJa: d('44Kv44Oz44OL'),
        kunlunZh: d('5piG5LuR'),
        lickPussyZh: d('6IiU5bCP56m0'),
        tekokiJa: d('5omL44Kz44Kt'),
        handmadeZh: d('5omL5bel'),
        handjobZh: d('5omL5Lqk'),
        shiofukiJa: d('5r2u5ZC544GN'),
        tideZh: d('5r2u5rGQ'),
        squirtZh: d('5r2u5ZC5'),
        gokkunJa: d('44GU44Gj44GP44KT'),
        gulpZh: d('5ZKV5ZKa'),
        swallowCumZh: d('5ZCe57K+'),
        omankoJa: d('44GK44G+44KT44GT'),
        mangoZh: d('6IqS5p6c'),
        pussyZh: d('5bCP56m0'),
        descendantsZh: d('5a2Q5a2Z'),
        yameteZh: d('5LiN6KaB'),
        mottoFukakuZh: d('5YaN5rex5LiA54K5'),
        ireteZh: d('6L+b5p2l'),
        ikuQZh: d('6KaB5Y675LqG5ZCX77yf'),
        putInsideZh: d('5b6A6YeM6Z2i5pS+'),
        grandpaZh: d('54i354i3'),
        oldGrandpaZh: d('6ICB54i354i3'),
        privatePartZh: d('56eB5aSE'),
        heixiuZh: d('5Zi/5ZK7'),
        belowThingZh: d('5LiL6Z2i6YKj5Liq5Lic6KW/'),
        penisZh: d('6Zi06IyO'),
        meatRodZh: d('6IKJ5qOS'),
        maleGenitalZh: d('55S35oCn55Sf5q6W5Zmo'),
        genitalZh: d('55Sf5q6W5Zmo'),
        bigSizeZh: d('5aSn5bC65a+4'),
        epididymisZh: d('6ZmE552+'),
        porchioJa: d('44Od44Or44OB44Kq'),
        penisHeadZh: d('6Zi06IyO5aS0'),
        cervixZh: d('5a2Q5a6r5Y+j'),
        pleaseEnterZh: d('6K+36L+b'),
        pleaseInsertZh: d('6K+35o+S6L+b5p2l'),
        okDoneZh: d('6KGM5LqG'),
        classStartZh: d('5LiK6K++6KaB5byA5aeL5LqG'),
        uterusDownZh: d('5a2Q5a6r6KaB6ZmN5LiL5p2l5LqG'),
        comingSoonZh: d('5bCx5p2l'),
        breastChestZh: d('6IO46YOo'),
        wontPassThroughZh: d('5LiN5Lya5pS+6L+H'),
        mankoKata: d('44Oe44Oz44Kz'),
        squeezeOutMilkZh: d('5oyk5Ye65aW2'),
        makeHardZh: d('5byE56Gs'),
        hardIntenseZh: d('56Gs5b6X5aW95Y6J5a6z'),
        rodAmazingZh: d('6IKJ5qOS5aW95Y6J5a6z5ZGi4oCm'),
        isRodQZh: d('5piv6IKJ5qOS5ZCn77yf'),
        softAgainZh: d('5Y+I6L2v5LqG'),
        softAgainQZh: d('5Y+I6L2v5LqG5ZCX77yf'),
        dadRodSoZh: d('5piv54i454i455qE6IKJ5qOS77yM5omA5Lul'),
        dadRodSoOkZh: d('5piv54i454i455qE77yM5omA5Lul'),
        dadRodZh: d('54i454i455qE6IKJ5qOS'),
        dadOkZh: d('54i454i455qE'),
        ofMeatRodZh: d('55qE6IKJ5qOS'),
        thatCockZh: d('6YKj6L6555qE6bih5be0'),
        thatSideZh: d('6YKj6L65'),
        ofCockZh: d('55qE6bih5be0'),
        surelyShootZh: d('6L+Z5qC36IKv5a6a6ams5LiK6KaB5bCE5LqG'),
        soonShootZh: d('6ams5LiK6KaB5bCE5LqG'),
        aboutToShootDoneZh: d('6KaB5bCE5LqG'),
        shootWantZh: d('6KaB5bCE'),
        nakadashiOkZh: d('5bCE5Zyo6YeM6Z2i'),
        deeperOkZh: d('5YaN5rex5LiA54K5'),
        pinpinOkZh: d('57+Y5b6X5aW956Gs5ZGi4oCm'),
        aboutToCumPlainZh: d('6KaB5Y675LqG'),
        aboutToCumQZh: d('6KaB5Y675LqG5ZCX77yf'),
        shootOutPrefixZh: d('5bCE5Ye6'),
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
        appleFruit: re('5p6X5qqOfOOCiuOCk+OBlA=='),
        appleZhG: new RegExp(T.appleZh, 'g'),
        wontPassThrough: new RegExp(T.wontPassThroughZh),
        // Include truncated ASR tails + hiragana ちんぽ
        dekachinSrc: new RegExp(
            `${T.dekachinJa}|${T.chinchinJa}|${T.ochinchinJa}|${T.ochinpoJa}|${T.chinpoJa}|${T.chinpoHiraJa}|${T.chinChinHiraJa}`
            + `|(?:${re('KD8644OHfOOBpyk/44Kr44OB44OzfOOBp+OBi+OBoeOCk3zjg4fjgqvjgaHjgpN85Ye644GL44GhfOOBruODh1xccyok').source})`,
        ),
        // Truncated climax scraps (イッちゃ… / イきそ… / イきゅ… / イッた…)
        ikuTruncSrc: re('44Kk44OD44Gh44KDfOOBhOOBo+OBoeOCg3zjgqTjgaPjgaHjgoN844Kk44GN44GdfOOCpOOCreOBnXzjgqTjgY3jgoV844Kk44Kt44OlfOOBhOOBjeOChXzjgqTjg4PjgZ9844GE44Gj44GffOOCpOOBo+OBnw=='),
        // Repeated いく / イク climax loops
        ikuRepeatSrc: re('44GE44GPKD86W+KApuODuy5cc10q44GE44GPKSt844Kk44KvKD86W+KApuODuy5cc10q44Kk44KvKSs='),
        itchaimasuSrc: re('44Kk44OD44Gh44KD44GEfOOBhOOBo+OBoeOCg+OBhHzjgqTjgaPjgaHjgoPjgYQ='),
        climaxIkuSrc: re('6KGM44GN44Gd44GGfOOBglvjgJzvvZ7jg7xdKuihjOOBj3znlJ/ooYzjgY9855Sf6KGM44Gj44Gh44KD44GGfOS/uuihjOOBj3zjgqTjgY9844Kk44Gj44Gh44KD44GGfOOCpOODg+OBoeOCg+OBhnzjgqTjg4PjgaHjgoPjgaPjgZ9844GE44Gj44Gh44KD44Gj44GffOOCpOOBo+OBoeOCg+OBo+OBn3zjgqTjg4PjgaHjgoPjgYTjgZ3jgYZ844Kk44Kt44Gd44GGfOOCpOOBjeOBneOBhnzjgYTjgaPjgaHjgoPjgYTjgZ3jgYZ844Kk44GL44GV44KMfOOCpOOCr+OCpOOCr3zjgqTjgq/jgaN844GE44Gj44Gh44KD44GGfOihjOOBo+OBoeOCg+OBhnwoPzpefFteYS16QS1aXSnjgqTjgq8oPzpbXmEtekEtWl18JCk='),
        chinkoBigSrc: new RegExp(`(?:${T.chinkuMo}|${T.chinkoMo}).{0,8}${re('44Gn44GL44GE').source}`),
        breastZh: new RegExp(T.breastChestZh),
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
        shotG: new RegExp(T.shotZh, 'g'),
        fastShotG: new RegExp(T.fastShotZh, 'g'),
        againShotG: new RegExp(T.againShotZh, 'g'),
        haveRelationG: new RegExp(T.haveRelationZh, 'g'),
        oneNightG: new RegExp(T.oneNightZh, 'g'),
        littleChickG: new RegExp(T.littleChickZh, 'g'),
        tinyChickG: new RegExp(T.tinyChickZh, 'g'),
        thatThingG: new RegExp(T.thatThingZh, 'g'),
        spitSomethingG: new RegExp(T.spitSomethingZh, 'g'),
        rodDupG: new RegExp(T.rodDupZh, 'g'),
        aboutToSoonG: new RegExp(T.aboutToSoonZh, 'g'),
        milkWaterG: new RegExp(T.milkWaterZh, 'g'),
        cowMilkG: new RegExp(T.cowMilkZh, 'g'),
        alreadyShotG: new RegExp(T.alreadyShotZh, 'g'),
        wantShootG: new RegExp(T.wantShootZh, 'g'),
        testicleG: new RegExp(T.testicleZh, 'g'),
        rekindleG: new RegExp(T.rekindleZh, 'g'),
        breedingSexG: new RegExp(T.breedingSexZh, 'g'),
        hardThingG: new RegExp(T.hardThingZh, 'g'),
        skinHardG: new RegExp(T.skinHardZh, 'g'),
        cameHereG: new RegExp(T.cameHereZh, 'g'),
        mountainTopG: new RegExp(T.mountainTopZh, 'g'),
        angryG: new RegExp(T.angryZh, 'g'),
        furiousG: new RegExp(T.furiousZh, 'g'),
        demoG: new RegExp(T.demoZh, 'g'),
        demoAltG: new RegExp(T.demoAltZh, 'g'),
        oralServiceG: new RegExp(T.oralServiceZh, 'g'),
        kunlunG: new RegExp(T.kunlunZh, 'g'),
        handmadeG: new RegExp(T.handmadeZh, 'g'),
        tideG: new RegExp(T.tideZh, 'g'),
        gulpG: new RegExp(T.gulpZh, 'g'),
        mangoG: new RegExp(T.mangoZh, 'g'),
        descendantsG: new RegExp(T.descendantsZh, 'g'),
        putInsideG: new RegExp(T.putInsideZh, 'g'),
        grandpaG: new RegExp(T.grandpaZh, 'g'),
        oldGrandpaG: new RegExp(T.oldGrandpaZh, 'g'),
        privatePartG: new RegExp(T.privatePartZh, 'g'),
        heixiuG: new RegExp(T.heixiuZh, 'g'),
        belowThingG: new RegExp(T.belowThingZh, 'g'),
        penisG: new RegExp(T.penisZh, 'g'),
        maleGenitalG: new RegExp(T.maleGenitalZh, 'g'),
        genitalG: new RegExp(T.genitalZh, 'g'),
        bigSizeG: new RegExp(T.bigSizeZh, 'g'),
        epididymisG: new RegExp(T.epididymisZh, 'g'),
        penisHeadG: new RegExp(T.penisHeadZh, 'g'),
        pleaseEnterG: new RegExp(T.pleaseEnterZh, 'g'),
        okDoneG: new RegExp(T.okDoneZh, 'g'),
        classStartG: new RegExp(T.classStartZh, 'g'),
        comingSoonG: new RegExp(T.comingSoonZh, 'g'),
        ejacHintSrc: re('5bCE57K+fOOCtuODvOODoeODs3znsr7mtrJ85Ye644GX44GmfOWHuuOBleOCjHzlh7rjgaHjgoPjgYZ85Ye644GZ44GefOWHuuOBl+OBpuOChOOCiw=='),
        ejacOutSrc: re('5Ye644Gh44KD44GGfOWHuuOCi+OCiHzlh7rjgovjgoLjgpN85bCE57K+fOOCtuODvOODoeODs3znsr7mtrJ85Ye644GX44Gm'),
        ejacShortSrc: re('5Ye644Gh44KD44GGfOWwhOeyvnzjgrbjg7zjg6Hjg7M='),
        erectOrHardSrc: re('5YuD6LW3fOODk+ODs+ODk+ODs3zjgbPjgpPjgbPjgpN844Ks44OB44Ks44OB'),
        binbinGachiSrc: re('44OT44Oz44OT44OzfOOCrOODgeOCrOODgQ=='),
        breakupSefriSrc: re('5Yil44KMfOOBteOCieOCjOOCi3zpmY3moLx844K744OV44OsfOW9vOawj3zlvbzlpbN85LuY44GN5ZCI44GG'),
        climaxIkuExtraSrc: re('44GE44Gh44KD44GGfOOCpOOBo+OBoeOCg+OBhnzjgqTjg4PjgaHjgoPjgYZ844GE44GP44GjfOOCpOOCr+ODg3zjgYTjgY/jgZ5844Kk44Kv44GefOOCpOOCseOCjXzjgYTjgZHjgo1844Gv44GE44GP44Ge'),
        chinpoMilkAltSrc: re('44OB44Oz44OR44Of44Or44KvfOODgeODs+ODneODn+ODq+OCrw=='),
        squeezeMilkSrc: re('5oyk5Ye65aW2fOaMpOS6my4q5aW2fOaMpC4q5aW25p2lfOaMpOS6m+eJm+Wltg=='),
        squeezeOutMilkG: new RegExp(T.squeezeOutMilkZh, 'g'),
        chinpoViewSrc: re('44GK44Gh44KT44G944OT44Ol44O8fOOBiuOBoeOCk+OBveOBs+OCheODvHzjgYrjgaHjgpPjgb3jg5Pjg6Xjg4M='),
        showYouSrc: re('55yL5Yeg5qyhfOe7meS9oOeciw=='),
        makeHardSrc: new RegExp(T.makeHardZh),
        mankoKataSrc: new RegExp(T.mankoKata),
        ikuChaSrc: re('44Kk44OD44Gh44KD44GGfOOBhOOBo+OBoeOCg+OBhg=='),
        putInsideAltsSrc: re('5b6A6YeM6Z2i5pS+fOaUvuWIsOmHjOmdonzmlL7ov5vljrs='),
        ikuBareBangSrc: re('44Kk44Kv44ODfOOBhOOBj+OBo3zjgqTjgq9bIe+8gV1844GE44GPWyHvvIFd'),
        ochinchinOrOhaSrc: re('44GK44Gh44KT44Gh44KTfOOBiuOBr+OBoeOCk+OBoeOCkw=='),
        chinkoErectTouchSrc: re('44OB44Oz44KzfOOBoeOCk+OBk3zjgYrjgaHjgpN85YuD44Gj44Gh44KD44GG'),
        ikuQBareSrc: re('Xig/OuOCpOOCr3zjgYTjgY9844Kk44OD44Gh44KD44GGKVvvvJ8/XSQ=', 'u'),
        erectingSrc: re('5YuD6LW344GX44Gm44KL'),
        limpMataSrc: re('KD8644GK44Gh44KT44G9fOOBiuOBoeOCk+OBoeOCkykuezAsOH0oPzrjgb7jgZ/jgaPjgaHjgoN86JCO44GI44Gh44KDKQ=='),
        limpMataShortSrc: re('KD8644GK44Gh44KT44G9fOOBiuOBoeOCk+OBoeOCkykuezAsNn0oPzrjgb7jgZ/jgaPjgaHjgoN86JCO44GI44Gh44KDKQ=='),
        climaxHallucZhSrc: re('6auY5r2ufOimgeWwhHzopoHljrvkuoY='),
        jaHasRodSrc: re('KD8644Gh44KTfOODgeODs3zogonmo5J844GK44Gh44KTfOOCpOODgeODouODhHznq79844Kr44OB44OzfOWHuuOBi+OBoSk='),
        clinicalRodZhSrc: re('55S35oCn55Sf5q6W5ZmofOeUn+auluWZqHzpmLTojI585aSn5bC65a+4'),
        meatRodSrc: new RegExp(T.meatRodZh),
        cockSrc: new RegExp(T.rodZh),
        dadRodSoG: new RegExp(T.dadRodSoZh, 'g'),
        dadRodG: new RegExp(T.dadRodZh, 'g'),
        ofMeatRodG: new RegExp(T.ofMeatRodZh, 'g'),
        meatRodG: new RegExp(T.meatRodZh, 'g'),
        thatCockG: new RegExp(T.thatCockZh, 'g'),
        ofCockG: new RegExp(T.ofCockZh, 'g'),
        cockG: new RegExp(T.rodZh, 'g'),
        jaHasClimaxSrc: re('KD8644KkW+OCr+ODg11844GE44GP44GjP3zjgqTjg4N85bCE57K+fOWHuuOBl+OBpnzlh7rjgaHjgoPjgYZ844Gn44Gh44KD44GGfOOCpOOCreOBneOBhik='),
        shootWantSrc: new RegExp(T.shootWantZh),
        surelyShootG: new RegExp(T.surelyShootZh, 'g'),
        soonShootG: new RegExp(T.soonShootZh, 'g'),
        aboutToShootDoneG: new RegExp(T.aboutToShootDoneZh, 'g'),
        footFetishSrc: re('KD866Laz5aW944GNfOi2s+ODleOCp+ODgXzotrPjg5Xjgqfjg7Pjgrh844OV44Kn44OBKQ=='),
        wearOrderSrc: re('5bGl44GR44Gj44GmfOWxpeOBkQ=='),
        iachuiOrIkuChaSrc: re('KD8644GE44GC44Gh44KF44GEfOOCpOODg+OBoeOCg+OBhnzjgYTjgaPjgaHjgoPjgYYp'),
        climaxStubSrc: re('KD8644Kk44OD44Gh44KD44GGfOOBhOOBo+OBoeOCg+OBhnzjgqTjg4PjgaHjgoMp'),
        ikuRemapSrc: re('KD8644Kk44OD44Gh44KD44GGfOOBhOOBo+OBoeOCg+OBhnzjgqTjgq9b44Gj44GjXXzjgqTjgq3jgZ3jgYZ844Kk44OD44Gh44KDKQ=='),
        ikuQOnlySrc: re('Xig/OuOCpOOCr3zjgYTjgY8pW++8nz9dJA=='),
        nakaDashitePlainSrc: re('5Lit44Gr5Ye644GX44Gm'),
        mottoFukakuSrc: re('44KC44Gj44Go5rex44GP'),
        rodSuggoiSrc: re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvSnjgYzjgZnjgaPjgZTjgYQ='),
        isOchinDeshoSrc: re('44Gg44KILj/jgYrjgaHjgpPjgaHjgpPjgafjgZfjgoc='),
        pinpinErectSrc: re('44OU44Oz44OU44Oz44Gr5YuD44Gj44Gm'),
        ahahaIkuSrc: re('KD8644Kk44OD44Gh44KD44GGfOOBhOOBo+OBoeOCg+OBhnzjgqTjgq3jgZ3jgYYp'),
        heixiuCueSrc: re('44Ko44OD44OBfOimgeWOu+S6hnzjgqTjg4N844Kk44Kv'),
        dekachinTruncSrc: re('KD8644OHfOOBpyk/44Kr44OB44OzfOOBp+OBi+OBoeOCk3zjg4fjgqvjgaHjgpN85Ye644GL44GhfOOBruODh1xccyok'),
        dekaiSrc: re('44Gn44GL44GE'),
        suckLickAtomSrc: re('Xig/OlvllaflkLjoiJTjgIEs77yMLuOAguKAplxz4oCUXC1dfOWQuOWQuCopKyQ=', 'u'),
        suckLickCharSrc: re('W+WVp+WQuOiIlF0='),
        moanClimaxJaSrc: re('44Kk44ODK3zjgqTjgq9844GE44Gj44Gh44KD44GG'),
        chinchiTruncSrc: re('KD8644GUfOWwkXzjgaHjgpPjgaF844GC44Gf44KIfOOBoeOCh+OBo+OBqOWwkSkk'),
        lickOnceSrc: re('Xig/OuiIlOS6huiIlHzoiJTkuIDkuIspW+OAgu+8ji4h77yBP++8n+KAplxzXSok', 'u'),
        lickOnceOrPeekSrc: re('Xig/OuiIlOS6huiIlHzoiJTkuIDkuIt85YG3556EKVvjgILvvI4uIe+8gT/vvJ/igKZcc10qJA==', 'u'),
        lickOnceTailG: re('KD866IiU5LqG6IiUfOiIlOS4gOS4iykoPz1b44CBLO+8jC7jgILigKYh77yBP++8n1xzXSokKQ==', 'gu'),
        insertBareSrc: re('Xig/OuaMv+OCjOOBpnzlhaXjgozjgaYpJA=='),
        insertPunctSrc: re('Xig/OuaMv+OCjOOBpnzlhaXjgozjgaYpW+OAgu+8ji4h77yBXSok', 'u'),
        uterusDownSrc: re('5a2Q5a6u5LiL44GM'),
    });

    /** Sensitive JA ASR pairs omitted from shared/ja-asr-domain-fixes.json plaintext. */
    const ASR_ADULT_PAIRS_B64 = 'W3siZnJvbSI6IuODleOCp+ODqeODs+ODh+ODouODs+OCueODiOODrOODvOOCt+ODp+ODsyIsInRvIjoi44OV44Kn44Op44Gu44OH44Oi44Oz44K544OI44Os44O844K344On44OzIn0seyJmcm9tIjoi5Ye644GX44Gh44KD44OA44Kk44OD44Gm44GK44GG44GLIiwidG8iOiLlh7rjgZfjgaHjgoPjg4Djg6HjgaPjgabjgYTjgYbjgYsifSx7ImZyb20iOiLjgqrjg7zjgq/lhaXjgozjgovjgojjgqrjg7zjg6kiLCJ0byI6IuWlpeWFpeOCjOOCi+OCiOOBu+OCiSJ9LHsiZnJvbSI6IuWkp+WlveOBjeOBquOCouODg+ODl+OBp+aMnyIsInRvIjoi5aSn5aW944GN44Gq44GK44Gj44Gx44GE44Gn5oyfIn0seyJmcm9tIjoi6ICz44Gu44OQ44OD44OI44Gz44KT44Gz44KTIiwidG8iOiLjgYrjgaHjgpPjgaHjgpPjg5Pjg7Pjg5Pjg7MifSx7ImZyb20iOiLos7zlhaXjgZfjgabjgabjgY/jgaDjgZXjgYQiLCJ0byI6IuiIiOWlruOBl+OBpuOBpuOBj+OBoOOBleOBhCJ9LHsiZnJvbSI6IuOBoeOCk+OBoeOCg+OCk+OBp+i1t+OBjeOBpiIsInRvIjoi44OB44Oz44OB44Oz44Gn6LW344GN44GmIn0seyJmcm9tIjoi5aSn5aW944GN44Gq44Ki44OD44OX44OrIiwidG8iOiLlpKflpb3jgY3jgarjgYrjgaPjgbHjgYQifSx7ImZyb20iOiLmgpTjgYTjgavjgZXjgozjgaHjgoPjgYYiLCJ0byI6IuWlpeOBq+OBleOCjOOBoeOCg+OBhiJ9LHsiZnJvbSI6IuS4gOaXpeOBruW9ouOChOWkp+OBjeOBlSIsInRvIjoi44Kk44OB44Oi44OE44Gu5b2i44KE5aSn44GN44GVIn0seyJmcm9tIjoi56WW54i244Go44Gv6YGV44GE44G+44GZIiwidG8iOiLpoqjkv5fjgajjga/pgZXjgYTjgb7jgZkifSx7ImZyb20iOiLjgYLjgaPjgIHjgY3jgoLjgaHjgYTjgYQiLCJ0byI6IuOBguOBo+OAgeawl+aMgeOBoeOBhOOBhCJ9LHsiZnJvbSI6IuOBhOOBo+OBoeOCg+OBhOOBo+OBoeOCgyIsInRvIjoi44Kk44OD44Gh44KD44Kk44OD44Gh44KDIn0seyJmcm9tIjoi44GK44GY44GE44Gh44KD44KT44Gh44KTIiwidG8iOiLjgYrjgaHjgpPjgaHjgpMifSx7ImZyb20iOiLjgYrjgaHjgpPjgZjjgoXjgYbjgZXjgpMiLCJ0byI6IuOBiuOBoeOCk+OBoeOCkyJ9LHsiZnJvbSI6IuOCs+ODvOODgeODs+aVo+OCjOOBn+OCiSIsInRvIjoi57K+5ray5pWj44KM44Gf44KJIn0seyJmcm9tIjoi44K544K/44Kk44OI44GX44G+44GZ44GtIiwidG8iOiLlh7rjgZ/jgYTjgafjgZnjga0ifSx7ImZyb20iOiLjgrvjg5Xjg6zjgqrjgrvjg4Pjgq/jgrkiLCJ0byI6IuOCu+ODleODrOOBruOCu+ODg+OCr+OCuSJ9LHsiZnJvbSI6IuODgeODs+ODgeODs+WPluOCiuWvneOBpiIsInRvIjoi44OB44Oz44OB44Oz5Y+W44KK5YWl44KM44GmIn0seyJmcm9tIjoi44Oe44Kk44Kv44Ot44OT44OD44Kt44OzIiwidG8iOiLjg57jgqTjgq/jg63jg5Pjgq3jg4sifSx7ImZyb20iOiLliJ3mra/jgpLku4roiJDjgoHjgaYiLCJ0byI6IuWFiOOBo+OBveOCkuS7iuiIkOOCgeOBpiJ9LHsiZnJvbSI6IuOBguOBguOBjeOCguOBoeOBhOOBhCIsInRvIjoi44GC44GC5rCX5oyB44Gh44GE44GEIn0seyJmcm9tIjoi44GC44Gj44GN44KC44Gh44GE44GEIiwidG8iOiLjgYLjgaPmsJfmjIHjgaHjgYTjgYQifSx7ImZyb20iOiLjgYrjgZjjgYTjgZXjgb7jgaHjgpMiLCJ0byI6IuOBiuOBoeOCk+OBoeOCkyJ9LHsiZnJvbSI6IuOCs+ODvOODiOOCguOBhuaIkeaFoiIsInRvIjoi44Gh44KH44Gj44Go44KC44GG5oiR5oWiIn0seyJmcm9tIjoi44K444Oj44OR44OL44O844K65LyaIiwidG8iOiLjgrjjg6Pjg5Hjg4vjg7zjgrrjgqzjgqQifSx7ImZyb20iOiLjg4DjgqTjg4PjgabjgYrjgYbjgYsiLCJ0byI6IuODgOODoeOBo+OBpuOBhOOBhuOBiyJ9LHsiZnJvbSI6IuOBoeOCk+OBoeOCh+OBmeOBjuOCiyIsInRvIjoi44Gh44KT44G944GZ44GO44KLIn0seyJmcm9tIjoi44OR44Kk44OD44Gm44GP44KM44GfIiwidG8iOiLjgqTjg4PjgabjgY/jgozjgZ8ifSx7ImZyb20iOiLjgb7jgZ/jgaPjgaHjgoPjgaPjgZ8iLCJ0byI6IuiQjuOBiOOBoeOCg+OBo+OBnyJ9LHsiZnJvbSI6IueXheS6uuWHuuOBoeOCg+OBhiIsInRvIjoi44Gz44KT44Gz44KT5Ye644Gh44KD44GGIn0seyJmcm9tIjoi5YWo6KO444GM44OG44Oz44OAIiwidG8iOiLlhajoo7jjgYwifSx7ImZyb20iOiLlhaXjgorjgZvjgYTjgafjgZkiLCJ0byI6IuWFpeOCiuOBneOBhuOBp+OBmSJ9LHsiZnJvbSI6IueUn+ihjOOBo+OBoeOCg+OBhiIsInRvIjoi44Kk44Gj44Gh44KD44GGIn0seyJmcm9tIjoi44Ki44K344Kr5o+P44GE44GmIiwidG8iOiLotrPplovjgYTjgaYifSx7ImZyb20iOiLjgYLjgaPjgbHjgYTjgafmjJ8iLCJ0byI6IuOBiuOBo+OBseOBhOOBp+aMnyJ9LHsiZnJvbSI6IuOCouODg+ODl+ODq+OBp+aMnyIsInRvIjoi44GK44Gj44Gx44GE44Gn5oyfIn0seyJmcm9tIjoi44Kk44Kx44Oh44Oz44Gh44KTIiwidG8iOiLjgYrjgaHjgpPjgaHjgpMifSx7ImZyb20iOiLjgqrjg7zjg4rjg7zjgaHjgpMiLCJ0byI6IuOBiuOBoeOCk+OBoeOCkyJ9LHsiZnJvbSI6IuOBiuOBhuOBoeOCk+OBoeOCkyIsInRvIjoi44GK44Gh44KT44Gh44KTIn0seyJmcm9tIjoi44GK44Gh44KT44Gh44KD44KTIiwidG8iOiLjgYrjgaHjgpPjgaHjgpMifSx7ImZyb20iOiLjgYrjga/jgaHjgpPjgaHjgpMiLCJ0byI6IuOBiuOBoeOCk+OBoeOCkyJ9LHsiZnJvbSI6IuOBj+OCk+OBq+OCiuOCk+OBkCIsInRvIjoi44Kv44Oz44OL44Oq44Oz44KwIn0seyJmcm9tIjoi44K144Kk44OD44OB44OA44OhIiwidG8iOiLlsITnsr7jg4Djg6EifSx7ImZyb20iOiLjg4Hjg6Xjg7Pjg4Hjg6Xjg7MiLCJ0byI6IuODgeODs+ODgeODsyJ9LHsiZnJvbSI6IuODgeODs+ODkeODn+ODq+OCryIsInRvIjoi44GK44Gh44KT44G944Of44Or44KvIn0seyJmcm9tIjoi44Gh44KT44G944KM44Gm44KLIiwidG8iOiLjgaHjgpPjgb3jgYzli4PjgaPjgabjgosifSx7ImZyb20iOiLjg4fjgqvjg4Hjg43jgr/jg7MiLCJ0byI6IuODh+OCq+ODgeODs+OBryJ9LHsiZnJvbSI6IuODleOCp+ODs+OCuOOBquOBriIsInRvIjoi44OV44Kn44OB44Gq44GuIn0seyJmcm9tIjoi44KC44GG5YiH44Gj44Gm44GtIiwidG8iOiLjgoLjgYbjgqTjgaPjgabjga0ifSx7ImZyb20iOiLlh7rjgZfjgarjgY7jgoMiLCJ0byI6IuWHuuOBl+OBquOBjeOCgyJ9LHsiZnJvbSI6IuiAs+OBruODkOODg+ODiCIsInRvIjoi44GK44Gh44KT44Gh44KT44GMIn0seyJmcm9tIjoi5p2l44KI44Kq44O844OpIiwidG8iOiLmnaXjgabjgbvjgokifSx7ImZyb20iOiLkuIDml6Xjga7lhYjjga8iLCJ0byI6IuOCpOODgeODouODhOOBruWFiOOBryJ9LHsiZnJvbSI6Iui2s+ODleOCp+ODs+OCuCIsInRvIjoi6Laz44OV44Kn44OBIn0seyJmcm9tIjoi44Ki44OD44OX44Gn5oyfIiwidG8iOiLjgYrjgaPjgbHjgYTjgafmjJ8ifSx7ImZyb20iOiLjgYTjgYLjgaHjgoXjgYQiLCJ0byI6IuOCpOODg+OBoeOCg+OBhiJ9LHsiZnJvbSI6IuOBhOOBvuOBqeODgOODoSIsInRvIjoi5LuK44Gv44OA44OhIn0seyJmcm9tIjoi44GN44Gh44KT44Gh44KTIiwidG8iOiLjgYrjgaHjgpPjgaHjgpMifSx7ImZyb20iOiLjgrTjg6nooYzjgY/jgogiLCJ0byI6IuOBu+OCieihjOOBj+OCiCJ9LHsiZnJvbSI6IuOBnOOBo+OBoeOCh+OBhiIsInRvIjoi57W26aCCIn0seyJmcm9tIjoi44OG44Oz44OA5YWo6KO4IiwidG8iOiLlhajoo7gifSx7ImZyb20iOiLjg4jjg6rjgYzkvY7jgYQiLCJ0byI6IuODiOODquOCrOODvOOBjOS9juOBhCJ9LHsiZnJvbSI6IuOBvuOBn+OBo+OBoeOCgyIsInRvIjoi6JCO44GI44Gh44KDIn0seyJmcm9tIjoi5aWl44Gn5r+A5YqxIiwidG8iOiLlpaXjgafliLrmv4AifSx7ImZyb20iOiLlh7rjgYvjgaHlr50iLCJ0byI6IuODh+OCq+ODgeODs+WvnSJ9LHsiZnJvbSI6IuaAkuiBtOOBl+OBpiIsInRvIjoi5YuD6LW344GX44GmIn0seyJmcm9tIjoi5pel5pys56ul5a2QIiwidG8iOiLml6XmnKzjga7nq6Xosp4ifSx7ImZyb20iOiLmjojmpa3kuIvjgYwiLCJ0byI6IuWtkOWuruS4i+OBjCJ9LHsiZnJvbSI6IueEoeeUqOS4jeaYjiIsInRvIjoi5ZCN5YmN5LiN5piOIn0seyJmcm9tIjoi44GC44Gw44GC44KCIiwidG8iOiLjgYLjgIHjgoLjgYYifSx7ImZyb20iOiLjgYrjgaTjgY3jgaciLCJ0byI6IuOBiuOBo+OBjeOBj+OBpiJ9LHsiZnJvbSI6IuOBl+OBiuOBteOBjSIsInRvIjoi5r2u5ZC544GNIn0seyJmcm9tIjoi44OB44Oz44Kv44KCIiwidG8iOiLjgaHjgpPjgZPjgoIifSx7ImZyb20iOiLjgaHjgpPjgb3jgpMiLCJ0byI6IuOBoeOCk+OBvSJ9LHsiZnJvbSI6IuOBp+OBoeOCg+OBhCIsInRvIjoi5Ye644Gh44KD44GEIn0seyJmcm9tIjoi44Gn44Gh44KD44GGIiwidG8iOiLlh7rjgaHjgoPjgYYifSx7ImZyb20iOiLjgarjgb7jga/jgoEiLCJ0byI6IueUn+ODj+ODoSJ9LHsiZnJvbSI6IuODleOCp+ODqeODvCIsInRvIjoi44OV44Kn44OpIn0seyJmcm9tIjoi44OZ44K/44OB44OzIiwidG8iOiLjg4fjgqvjg4Hjg7MifSx7ImZyb20iOiLjgbvjgaPjgbHjgYQiLCJ0byI6IuOBiuOBo+OBseOBhCJ9LHsiZnJvbSI6IuOBu+OBvuOCk+OBkyIsInRvIjoi44GK44G+44KT44GTIn0seyJmcm9tIjoi5r2u44G144GNIiwidG8iOiLmva7lkLnjgY0ifSx7ImZyb20iOiLlh7rjgYvjgaEiLCJ0byI6IuODh+OCq+ODgSJ9LHsiZnJvbSI6IumHkeacquadpSIsInRvIjoi6YeR546J5pyq5p2lIn0seyJmcm9tIjoi6YeR44OR44OzIiwidG8iOiLjg4Hjg7Pjg50ifSx7ImZyb20iOiLnlJ/ooYzjgY8iLCJ0byI6IuOCpOOBjyJ9LHsiZnJvbSI6IueUn+OBr+OCgSIsInRvIjoi55Sf44OP44OhIn0seyJmcm9tIjoi5omL44GT44GNIiwidG8iOiLmiYvjgrPjgq0ifSx7ImZyb20iOiLku7Llh7rjgZciLCJ0byI6IuS4reWHuuOBlyJ9LHsiZnJvbSI6IuOCpOOBjeOBnSIsInRvIjoi44Kk44Kt44Gd44GGIn0seyJmcm9tIjoi44GK5q2j5rCXIiwidG8iOiLjgYrku5Xnva7jgY0ifSx7ImZyb20iOiLjgYrjgZfjgosiLCJ0byI6IuOBiuaxgSJ9LHsiZnJvbSI6IuOCt+ODleODrCIsInRvIjoi44K744OV44OsIn0seyJmcm9tIjoi44OV44Ko44OpIiwidG8iOiLjg5Xjgqfjg6kifSx7ImZyb20iOiLjg57jg7PjgrMiLCJ0byI6IuOBiuOBvuOCk+OBkyJ9LHsiZnJvbSI6IuOCiuOCg+OCgSIsInRvIjoi44KE44KBIn0seyJmcm9tIjoi5Lmz6L6yIiwidG8iOiLkubPmiL8ifSx7ImZyb20iOiLpioDpioAiLCJ0byI6IuODk+ODs+ODk+ODsyJ9XQ==';

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
                cur = cur.split(T.breastChestZh).join(T.rodZh);
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
            (
                src.includes(T.toroToroJa)
                || src.includes(T.torottoroJa)
                || src.includes(T.dorodoroJa)
                || /とろとろ|とろっとろ|ドロッ|どろっ|ピチョ|びちゃ|びちょ/.test(src)
            )
            && cur.includes(T.softCottonZh)
        ) {
            cur = cur.split(T.softCottonZh).join(T.wetMessyZh);
            note('domain_term');
        }
        // Anatomy misread as balls / erect-verb euphemism
        if (RE.dekachinSrc.test(src) && !src.includes(T.kintamaJa) && cur.includes(T.ballsZh)) {
            cur = cur.split(T.ballsZh).join(T.rodZh);
            note('domain_term');
        }
        if (
            RE.dekachinSrc.test(src)
            && cur.includes(T.erectVerbZh)
            && !RE.erectOrHardSrc.test(src)
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
        if (
            (
                RE.climaxIkuSrc.test(src)
                || RE.climaxIkuExtraSrc.test(src)
                || RE.itchaimasuSrc.test(src)
                || RE.ikuTruncSrc.test(src)
                || RE.ikuRepeatSrc.test(src)
            )
            && (
                cur.includes(T.shootCumShortZh)
                || cur.includes(T.shotZh)
                || cur.includes(T.fastShotZh)
                || cur.includes(T.againShotZh)
                || /射出来|能射/.test(cur)
            )
            && !RE.ejacHintSrc.test(src)
            && !/出して|出され|射精/.test(src)
        ) {
            const marked = cur.split(T.dontShootZh).join('\uE000');
            const next = marked
                .replace(/能射出来/g, '能去')
                .replace(/射出来吧/g, '去吧')
                .replace(/射出来/g, '去了')
                .replace(/能射/g, '能去')
                .replace(RE.shootCumG, T.aboutToCumZh)
                .replace(RE.shootCumShortG, T.goCumShortZh)
                .replace(RE.fastShotG, T.fastCameZh)
                .replace(RE.againShotG, T.againCameZh)
                .replace(RE.shotG, T.cameZh)
                .split('\uE000').join(T.dontShootZh);
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // いくいく… →「行」/「行了」(not 不行了)
        if (
            (
                RE.ikuRepeatSrc.test(src)
                || /^(?:いく|イク)(?:[…・.\s、,]*|(?:いく|イク))+[…。．.!！?\s]*$/u.test(src.trim())
            )
            && /行/.test(cur)
            && !/不行/.test(cur)
        ) {
            const marked = cur.split('不行了').join('\uE000');
            let next = marked.replace(/行了/g, T.aboutToCumZh);
            // Bare「行」tokens (comma/ellipsis separated)
            next = next.replace(/(^|[，,、\s…])行(?=$|[。．.…!！?？，,、\s…]|要去了)/g, `$1${T.aboutToCumZh}`);
            next = next.split('\uE000').join('不行了');
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // やめ / りゃめ →「要射了」/「射了」hallucination
        if (
            /(?:やめ|りゃめ|ヤメ)/.test(src)
            && (cur.includes(T.shootCumShortZh) || cur.includes(T.shotZh))
            && !RE.climaxIkuSrc.test(src)
            && !RE.ikuTruncSrc.test(src)
            && !RE.ikuRepeatSrc.test(src)
            && !RE.ejacHintSrc.test(src)
        ) {
            cur = cur
                .replace(RE.shootCumG, '不要')
                .replace(RE.shootCumShortG, '不要')
                .replace(RE.shotG, '')
                .replace(/[，,]{2,}/g, '，')
                .replace(/[，,]\s*…/g, '…')
                .replace(/\s{2,}/g, ' ')
                .replace(/…{2,}/g, '…')
                .trim();
            note('domain_hallucination');
        }
        // 無用不明 →「无用不明」(名前不明 ASR)
        if (/無用不明|名前不明/.test(src) && /无用不明/.test(cur)) {
            cur = cur.replace(/无用不明/g, '名字不明');
            note('domain_term');
        }
        // ちゅばっ / ちゅぷ mixed with moans →「吸吧/吃吧」hallucination
        if (/ちゅば|チュバ|ちゅぷ|チュプ/.test(src) && /吸吧|吃吧|吱巴/.test(cur)) {
            cur = cur
                .replace(/吸吧|吃吧|吱巴/g, '')
                .replace(/[，,]{2,}/g, '，')
                .replace(/^[，,\s…]+|[，,\s]+$/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            note('domain_hallucination');
        }
        // ちゃんちゃん →「初音」hallucination (no 初音 in JA)
        if (/ちゃんちゃん/.test(src) && /初音/.test(cur) && !/初音/.test(src)) {
            cur = cur.replace(/小初音/g, '').replace(/初音/g, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/…+/g, '…')
                .trim();
            note('domain_hallucination');
        }
        // Sex term euphemized as soft relationship phrasing
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
        // Anatomy → childish / vague euphemisms
        if (RE.dekachinSrc.test(src)) {
            if (cur.includes(T.tinyChickZh)) {
                cur = cur.replace(RE.tinyChickG, T.rodZh);
                note('domain_term');
            }
            if (cur.includes(T.littleChickZh)) {
                cur = cur.replace(RE.littleChickG, T.rodZh);
                note('domain_term');
            }
            if (cur.includes(T.thatThingZh)) {
                cur = cur.replace(RE.thatThingG, T.rodZh);
                note('domain_term');
            }
        }
        // Show-anatomy cue → vague spit phrasing
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
            && (cur.includes(T.breakupZh) || cur.includes(T.lickNippleZh))
        ) {
            cur = T.noLickNippleOkZh;
            note('domain_term');
        }
        // Spurious「分手」bleed when JA has no breakup
        if (
            cur.includes(T.breakupZh)
            && !RE.breakupSefriSrc.test(src)
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
        // いちゃう / イク →「要开始了」
        if (
            (RE.climaxIkuSrc.test(src) || RE.climaxIkuExtraSrc.test(src))
            && cur.includes(T.aboutToStartZh)
        ) {
            cur = cur.replace(RE.aboutToStartG, T.aboutToCumZh);
            note('domain_term');
        }
        // いちゃう、開いちゃう truncated stub
        if (
            /いちゃう/.test(src)
            && /開いちゃう|ひらいちゃう/.test(src)
            && (/^要去了[，,]?$/.test(cur) || cur === T.aboutToCumZh || cur === `${T.aboutToCumZh}，`)
        ) {
            cur = FIX.itchaunStartOkZh;
            note('domain_term');
        }
        // Anatomy+milk / sexual milk → dairy mistranslation
        if (
            (
                src.includes(T.chinpoMilkJa)
                || RE.chinpoMilkAltSrc.test(src)
                || (/ミルク/.test(src) && (/出す|出して|たくさん/.test(src) || /挤|出/.test(cur)))
            )
            && (cur.includes(T.milkWaterZh) || cur.includes(T.cowMilkZh) || RE.squeezeMilkSrc.test(cur))
        ) {
            cur = cur
                .replace(RE.milkWaterG, T.semenZh)
                .replace(RE.cowMilkG, T.semenZh)
                .replace(RE.squeezeOutMilkG, `${T.shootOutPrefixZh}${T.semenZh}`)
                .replace(/挤些/g, '挤些');
            note('domain_term');
        }
        // コート/ちょっと + milk line with leftover「外套」
        if (
            /ミルク/.test(src)
            && /出す|出して/.test(src)
            && /我慢できない|がまんできない/.test(src)
            && (/外套/.test(cur) || /コート/.test(src))
        ) {
            cur = FIX.coatMilkOkZh;
            note('domain_term');
        }
        // 我慢できない + milk inverted as「再忍耐」
        if (
            src.includes(T.chinpoMilkJa)
            && /我慢できない|がまんできない/.test(src)
            && /忍耐/.test(cur)
        ) {
            cur = FIX.cantHoldMilkOkZh;
            note('domain_term');
        }
        // Anatomy reveal cue misread as show-you
        if (
            RE.chinpoViewSrc.test(src)
            && RE.showYouSrc.test(cur)
        ) {
            cur = FIX.viewSpurtOkZh;
            note('domain_term');
        }
        // ちょうだい hallucinated as chick/erect with no chin in JA
        if (
            /ちょうだい/.test(src)
            && !RE.dekachinSrc.test(src)
            && (
                cur.includes(T.littleChickZh)
                || cur.includes(T.tinyChickZh)
                || RE.makeHardSrc.test(cur)
            )
        ) {
            const n = (src.match(/ちょうだい/g) || []).length;
            cur = n >= 2 ? `${T.giveMeZh}，${T.giveMeZh}` : T.giveMeZh;
            note('domain_term');
        }
        // Climax past → male-release ZH → came ZH
        if (
            /イッちゃっ|いっちゃっ|イっちゃっ/.test(src)
            && cur.includes(T.alreadyShotZh)
        ) {
            cur = cur.replace(RE.alreadyShotG, T.alreadyCameZh);
            note('domain_term');
        }
        // Want-to-go → want-release → want-go
        if (/行きたい/.test(src) && cur.includes(T.wantShootZh)) {
            cur = cur.replace(RE.wantShootG, T.wantGoZh);
            note('domain_term');
        }
        // Bare climax go → release/start ZH → about-to-cum
        if (
            /行く/.test(src)
            && !/どこ行|行けたら|行けば|行ける|行って|行っちゃった|出て行|行けた|行こう/.test(src)
            && !RE.ejacOutSrc.test(src)
            && (
                cur.includes(T.shootCumShortZh)
                || cur.includes(T.shootCumZh)
                || cur.includes(T.aboutToStartZh)
            )
        ) {
            cur = cur
                .replace(RE.aboutToStartG, T.aboutToCumZh)
                .replace(RE.shootCumG, T.aboutToCumZh)
                .replace(RE.shootCumShortG, T.goCumShortZh);
            note('domain_term');
        }
        // nakadashi →「重温旧情」(with or without sex cue)
        if (
            (src.includes(T.nakadashiJa) || /仲出し/.test(src))
            && cur.includes(T.rekindleZh)
        ) {
            cur = cur.replace(RE.rekindleG, T.nakadashiSexZh);
            note('domain_term');
        }
        // Breeding-sex cue → clinical breeding phrasing
        if (
            src.includes(T.tanetsukeJa)
            && (src.includes(T.sexJa) || src.includes(T.sexHiraJa))
            && cur.includes(T.breedingSexZh)
        ) {
            cur = cur
                .split(`进行${T.breedingSexZh}`).join(T.seedSexZh)
                .replace(RE.breedingSexG, T.seedSexZh);
            note('domain_term');
        }
        // Anatomy → hard-thing euphemisms
        if (RE.dekachinSrc.test(src)) {
            if (cur.includes(T.skinHardZh)) {
                cur = cur.replace(RE.skinHardG, T.rodZh);
                note('domain_term');
            } else if (cur.includes(T.hardThingZh)) {
                cur = cur.replace(RE.hardThingG, T.rodZh);
                note('domain_term');
            }
        }
        // Sex-friend truncated after boyfriend negation
        if (
            src.includes(T.sefriJa)
            && /不是男朋友|没有男朋友|不是男友|没男友/.test(cur)
            && !cur.includes(T.sexFriendZh)
        ) {
            const bare = cur.replace(/[，,。．.\s]+$/u, '');
            cur = `${bare}，是${T.sexFriendZh}`;
            note('domain_term');
        }
        // short 出ちゃう →「来了」
        if (
            /出ちゃう/.test(src)
            && !/どこ|店|エラー|外に出す|残り出して/.test(src)
            && (cur === T.cameHereZh || cur === `${T.cameHereZh}。` || /^[啊阿]?来了[。．.]?$/.test(cur))
        ) {
            cur = T.shootCumZh;
            note('domain_term');
        }
        // 出ちゃいそう / 出ちゃいます →「要出来了」(ejac euphemism)
        // Keep 外に出し (cum outside); only skip literal leave-the-place 外に出る/出て.
        if (
            /出ちゃ|でちゃ/.test(src)
            && !/どこ|店|エラー|外に出ちゃ|外に出[るて]|外へ出|残り出|出て行|出かけ|出てく|あばあ|おじい|祖父|爺/.test(src)
            && !cur.includes(T.grandpaZh)
            && !cur.includes(T.oldGrandpaZh)
            && (/要出来了|又要出来了/.test(cur) || (/出来了/.test(cur) && !/射在|射到|射出来/.test(cur)))
        ) {
            const next = cur
                .replace(/又要出来了/g, T.againShootZh)
                .replace(/要出来了/g, T.shootCumZh)
                .replace(/出来了/g, T.shotZh)
                .replace(new RegExp(T.patientZh, 'g'), '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').replace(/…{2,}/g, '…').trim();
                note('domain_term');
            }
        }
        // 病人 leftover after びんびん ASR fix
        if (/びんびん出ちゃ|出ちゃ/.test(src) && cur.includes(T.patientZh) && !/病人|患者/.test(src)) {
            cur = cur.replace(new RegExp(T.patientZh, 'g'), '').replace(/\s{2,}/g, ' ').trim();
            note('domain_hallucination');
        }
        // Balls JA → clinical ZH → colloquial ZH
        if (src.includes(T.kintamaJa) && cur.includes(T.testicleZh)) {
            cur = cur.replace(RE.testicleG, T.ballsZh);
            note('domain_term');
        }
        // 舐められ…出ちゃう hallucinated as drinking milk
        if (
            /舐められ/.test(src)
            && /出ちゃう/.test(src)
            && /奶|小姐/.test(cur)
        ) {
            cur = T.lickCumOkZh;
            note('domain_term');
        }
        // 絶頂 →「山顶」
        if (RE.orgasmHint.test(src) && cur.includes(T.mountainTopZh)) {
            cur = cur.replace(RE.mountainTopG, T.orgasmZh);
            note('domain_term');
        }
        // Erect JA → anger mistranslation
        if (
            (src.includes(T.erectJa) || RE.binbinGachiSrc.test(src))
            && (cur.includes(T.furiousZh) || cur.includes(T.angryZh))
        ) {
            cur = cur
                .replace(RE.furiousG, T.hardOkZh)
                .split(`${T.angryZh}了`).join(T.hardOkZh)
                .replace(RE.angryG, T.hardOkZh);
            note('domain_term');
        }
        // Finish-inside cue → put-inside mistranslation
        if (
            src.includes(T.nakaDashiteJa)
            && (cur.includes(T.putInsideZh) || RE.putInsideAltsSrc.test(cur))
        ) {
            cur = T.nakaDashiteZh;
            note('domain_term');
        }
        // Oral JA → demo / oral-service mistranslation
        if (
            (src.includes(T.fellaJa) || /咥え|口でして/.test(src))
            && (
                cur.includes(T.demoZh)
                || cur.includes(T.demoAltZh)
                || cur.includes(T.oralServiceZh)
            )
        ) {
            if (cur.includes(T.oralServiceZh)) {
                cur = cur.replace(RE.oralServiceG, T.oralZh);
            } else if (cur.includes(`做个${T.demoZh}`)) {
                cur = cur.split(`做个${T.demoZh}`).join(T.oralZh);
            } else if (cur.includes(`做个${T.demoAltZh}`)) {
                cur = cur.split(`做个${T.demoAltZh}`).join(T.oralZh);
            } else {
                cur = cur
                    .replace(RE.demoG, T.oralZh)
                    .replace(RE.demoAltG, T.oralZh);
            }
            note('domain_term');
        }
        // Cunnilingus JA → place-name mistranslation
        if (src.includes(T.kunniJa) && cur.includes(T.kunlunZh)) {
            cur = cur.replace(RE.kunlunG, T.lickPussyZh);
            note('domain_term');
        }
        // Handjob JA → handmade mistranslation
        if (
            (src.includes(T.tekokiJa) || /シコシコ/.test(src))
            && cur.includes(T.handmadeZh)
        ) {
            cur = cur
                .split(`做${T.handmadeZh}`).join(T.handjobZh)
                .replace(RE.handmadeG, T.handjobZh);
            note('domain_term');
        }
        // Squirt JA → tide mistranslation
        if (src.includes(T.shiofukiJa) && cur.includes(T.tideZh)) {
            cur = cur.replace(RE.tideG, T.squirtZh);
            note('domain_term');
        }
        // Swallow cue → gulp SFX mistranslation
        if (src.includes(T.gokkunJa) && cur.includes(T.gulpZh)) {
            cur = cur
                .split(`${T.gulpZh}一口`).join(T.swallowCumZh)
                .replace(RE.gulpG, T.swallowCumZh);
            note('domain_term');
        }
        // Anatomy → mango mistranslation
        if (
            (src.includes(T.omankoJa) || RE.mankoKataSrc.test(src))
            && cur.includes(T.mangoZh)
            && !/マンゴー|芒果を食|芒果汁/.test(src)
        ) {
            cur = cur.replace(RE.mangoG, T.pussyZh);
            note('domain_term');
        }
        // semen/sperm misread as「子孙」
        if (
            (src.includes(T.semenJa) || src.includes(T.spermJa))
            && cur.includes(T.descendantsZh)
        ) {
            cur = cur.replace(RE.descendantsG, T.semenZh);
            note('domain_term');
        }
        // climax JA →「爷爷」hallucination (ochinchin ASR bleed)
        if (
            (RE.climaxIkuSrc.test(src) || RE.ikuChaSrc.test(src) || RE.ikuTruncSrc.test(src))
            && (cur.includes(T.grandpaZh) || cur.includes(T.oldGrandpaZh))
            && !/おじい|祖父|爺/.test(src)
        ) {
            cur = FIX.ikuGrandpaOkZh;
            note('domain_term');
        }
        // 出ちゃいそう →「爷爷也要出来了」(あばあ ASR bleed)
        if (
            /出ちゃい|でちゃい/.test(src)
            && (cur.includes(T.grandpaAlsoOutBadZh) || (cur.includes(T.grandpaZh) && /出来/.test(cur)))
            && !/おじい|祖父|爺/.test(src)
        ) {
            if (cur.includes(T.grandpaAlsoOutBadZh)) {
                cur = cur.split(T.grandpaAlsoOutBadZh).join(T.grandpaAlsoOutOkZh);
            } else {
                cur = cur.replace(RE.grandpaG, '').replace(/\s{2,}/g, ' ').trim();
            }
            note('domain_term');
        }
        // Anatomy → grandpa hallucination
        if (
            RE.dekachinSrc.test(src)
            && !/おじい|祖父|爺/.test(src)
            && (cur.includes(T.grandpaZh) || cur.includes(T.oldGrandpaZh))
        ) {
            cur = cur
                .replace(RE.oldGrandpaG, T.rodZh)
                .replace(RE.grandpaG, T.rodZh);
            note('domain_term');
        }
        // Anatomy → private-part euphemism
        if (
            (src.includes(T.omankoJa) || RE.mankoKataSrc.test(src))
            && cur.includes(T.privatePartZh)
        ) {
            if (/舐め|舐めて/.test(src) && /ダメ|だめ/.test(src)) {
                cur = FIX.omankoPrivateOkZh;
            } else {
                cur = cur.replace(RE.privatePartG, T.pussyZh);
            }
            note('domain_term');
        }
        // Soft sex euphemism ZH
        if (
            cur.includes(T.heixiuZh)
            && (src.includes(T.sexJa) || src.includes(T.sexHiraJa) || RE.climaxIkuSrc.test(src) || RE.heixiuCueSrc.test(src + cur))
        ) {
            cur = cur.replace(RE.heixiuG, T.makeLoveZh);
            note('domain_term');
        }
        // Moan-only JA →「嘿咻」hallucination (IPZZ-399)
        if (
            cur.includes(T.heixiuZh)
            && /^[\u3040-\u30ffー〜～っッ…。．.!！?？\s]+$/u.test(src)
            && !src.includes(T.sexJa)
            && !src.includes(T.sexHiraJa)
            && !RE.climaxIkuSrc.test(src)
        ) {
            cur = cur.replace(RE.heixiuG, '嗯');
            note('domain_hallucination');
        }
        // Foot-grind cue stubbed as classmate (IPZZ-399)
        if (src.includes(T.footGrindJa) && (/同学|同學/.test(cur) || cur === '同学')) {
            cur = T.footGrindOkZh;
            note('domain_term');
        }
        // Truncated フェラ →「还有」
        if (/フェラ/.test(src) && /^(?:还有|還有)[…。．.\s]*$/u.test(cur.trim())) {
            cur = T.alsoFellaOkZh;
            note('domain_term');
        }
        // もっと/いっぱい舐めて stubbed as 呵 / 好 / 遍 / 舔了
        if (
            /舐めて/.test(src)
            && /もっと|こっち|ほら|いっぱい/.test(src)
            && /^(?:呵|好|嗯|哈|遍|多|舔了)[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = /ほら/.test(src) ? T.horaLickOkZh : T.moreLickOkZh;
            note('domain_term');
        }
        // 舐めてくれるの初めて stubbed as 那个…
        if (
            /舐めて/.test(src)
            && /初めて/.test(src)
            && /^(?:那个|這个|这个|啊|嗯)[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = T.firstLickOkZh;
            note('domain_term');
        }
        // らめらめ →「不要不要」(baby だめだめ); drop long invent
        if (
            /らめらめ|ラメラメ/.test(src)
            && !/ダメ|だめ|いや|やめ/.test(src)
            && (
                /^(?:好棒|不要|不行)[\s\S]{0,24}$/u.test(cur.trim())
                || (cur.includes('好舒服') && cur.includes('不行') && [...cur.replace(/\s/g, '')].length >= 10)
                || cur === T.dameDameZh
            )
        ) {
            cur = T.dameDameZh;
            note('domain_term');
        }
        // Bare イクッ! invent as long 不行 moan stack
        if (
            RE.ikuBareBangSrc.test(src)
            && [...src.replace(/\s/g, '')].length <= 6
            && [...cur.replace(/\s/g, '')].length >= 8
            && !/要去|去了|射/.test(cur)
            && /不行|啊/.test(cur)
        ) {
            cur = T.aboutToCumZh;
            note('domain_term');
        }
        // おつきで / おっきくて → geographic invent (螃蟹/城市)
        if (
            /おつきで|おっきくて/.test(src)
            && /螃蟹|城市|著名/.test(cur)
            && [...src.replace(/\s/g, '')].length <= 12
        ) {
            cur = T.bigOkZh;
            note('domain_hallucination');
        }
        // 気持ちいい stubbed as 好热 / 感觉好 / moan-only / 好厉害
        if (/気持ちいい|きもちいい|きもちぃ|キモチイイ/.test(src)) {
            const stub = /^(?:好热|感觉好|好厉害|(?:哈啊)+|嗯)[…。．.!！?\s]*$/u.test(cur.trim());
            if (stub || cur.trim() === T.hotZh || cur.trim() === T.feelGoodStubZh) {
                if (/[?？]/.test(src)) {
                    cur = /これ/.test(src) ? T.thisFeelQZh : T.feelGoodQZh;
                } else {
                    cur = /[…・]/.test(src) ? T.feelGoodEllZh : T.feelGoodZh;
                }
                note('domain_term');
            }
        }
        // 出しちゃダメっていうか / ASR ダイッて →「请射出来吧」(polarity flip)
        if (
            (/出しちゃダメ|出しちゃだめ|出しちゃダイッて/.test(src))
            && (cur.includes(T.pleaseShootZh) || /请射出来/.test(cur))
        ) {
            cur = T.againCantShootQZh;
            note('domain_hallucination');
        }
        // 「下面那个东西」
        if (cur.includes(T.belowThingZh) && (RE.dekachinSrc.test(src) || /舔|含|口/.test(cur))) {
            cur = cur.replace(RE.belowThingG, T.rodZh);
            note('domain_term');
        }
        // Erect JA misread as already-shot / want-shot
        if (
            src.includes(T.erectJa)
            && !RE.ejacShortSrc.test(src)
            && (cur.includes(T.alreadyShotZh) || cur.includes(T.wantShootZh))
        ) {
            cur = FIX.erectShootOkZh;
            note('domain_term');
        }
        // Climax bang → ok-done (avoid rewriting cannot)
        if (
            (RE.ikuBareBangSrc.test(src) || RE.climaxIkuSrc.test(src))
            && cur.includes(T.okDoneZh)
            && !/行く|行って|行け/.test(src)
        ) {
            const marked = cur.split('不行了').join('\uE000');
            const next = marked.replace(RE.okDoneG, T.aboutToCumZh).split('\uE000').join('不行了');
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // Anatomy → penis gender-flip → correct ZH
        if (
            (src.includes(T.omankoJa) || RE.mankoKataSrc.test(src))
            && cur.includes(T.penisZh)
            && !RE.dekachinSrc.test(src)
        ) {
            const marked = cur.split(T.penisHeadZh).join('\uE000');
            const next = marked.replace(RE.penisG, T.pussyZh).split('\uE000').join(T.penisHeadZh);
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // ochinpo clinical ZH → colloquial rod
        if (RE.dekachinSrc.test(src) && cur.includes(T.penisZh)) {
            cur = cur.replace(RE.penisG, T.meatRodZh);
            note('domain_term');
        }
        // お汁みたい →「好像要射了」
        if (
            (src.includes(T.juiceLikeJa) || /おしるみたい|お汁みたい/.test(src))
            && cur.includes(T.shootCumShortZh)
            && !RE.climaxIkuSrc.test(src)
            && !RE.ikuTruncSrc.test(src)
        ) {
            cur = T.juiceLikeOkZh;
            note('domain_term');
        }
        // Climax cue stubbed as short name (あっ、イク… → 一君). Do not touch … / 要去了吗.
        if (
            (RE.climaxIkuSrc.test(src) || RE.ikuTruncSrc.test(src))
            && [...src.replace(/\s/g, '')].length <= 10
            && /君$/.test(cur.trim())
            && [...cur.replace(/\s/g, '')].length <= 4
            && !/要去|去了|舒服|不行|啊|嗯|哈|射/.test(cur)
        ) {
            cur = T.aboutToCumZh;
            note('domain_term');
        }
        // イッてくれた →「谢谢你射了」
        if (
            /イッてくれた|いっくれて|パイッてくれた/.test(src)
            && cur.includes(T.thanksCameBadZh)
        ) {
            cur = cur.split(T.thanksCameBadZh).join(T.thanksCameOkZh);
            note('domain_term');
        }
        // Clinical genital ZH → colloquial rod (compound size first)
        if (cur.includes(T.maleGenitalZh) || cur.includes(T.genitalZh)) {
            if (cur.includes(`${T.bigSizeZh}的${T.maleGenitalZh}`)) {
                cur = cur.split(`${T.bigSizeZh}的${T.maleGenitalZh}`).join(T.bigRodZh);
                note('domain_term');
            }
            if (cur.includes(`${T.bigSizeZh}的${T.genitalZh}`)) {
                cur = cur.split(`${T.bigSizeZh}的${T.genitalZh}`).join(T.bigRodZh);
                note('domain_term');
            }
            if (cur.includes(T.maleGenitalZh)) {
                cur = cur.replace(RE.maleGenitalG, T.meatRodZh);
                note('domain_term');
            }
            // Bare genital ZH only with anatomy / truncated size cue
            if (cur.includes(T.genitalZh) && RE.dekachinSrc.test(src)) {
                cur = cur.replace(RE.genitalG, T.meatRodZh);
                note('domain_term');
            }
        }
        // Size anatomy / truncated ASR → size ZH → big rod
        if (
            (RE.dekachinSrc.test(src) || cur.includes(T.meatRodZh) || cur.includes(T.bigRodZh))
            && cur.includes(T.bigSizeZh)
        ) {
            cur = cur.replace(RE.bigSizeG, T.bigRodZh);
            note('domain_term');
        }
        // Collapse duplicated rod phrasing after dual replacements
        if (cur.includes(`${T.bigRodZh}的${T.meatRodZh}`)) {
            cur = cur.split(`${T.bigRodZh}的${T.meatRodZh}`).join(T.bigRodZh);
            note('domain_term');
        }
        // Balls JA → epididymis clinical → colloquial
        if (src.includes(T.kintamaJa) && cur.includes(T.epididymisZh)) {
            cur = cur.replace(RE.epididymisG, T.ballsZh);
            note('domain_term');
        }
        // Portio JA → penis-head clinical → cervix ZH
        if (src.includes(T.porchioJa) && cur.includes(T.penisHeadZh)) {
            cur = cur.replace(RE.penisHeadG, T.cervixZh);
            note('domain_term');
        }
        // 入れてください →「请进」
        if (/入れてください|入れて下さい/.test(src) && cur.includes(T.pleaseEnterZh)) {
            cur = cur.replace(RE.pleaseEnterG, T.pleaseInsertZh);
            note('domain_term');
        }
        // Uterus-down cue → class-start mistranslation
        if (RE.uterusDownSrc.test(src) && cur.includes(T.classStartZh)) {
            cur = cur.replace(RE.classStartG, T.uterusDownZh);
            note('domain_term');
        }
        // Finish-out loop → coming-soon mistranslation
        if (/出ちゃ/.test(src) && cur.includes(T.comingSoonZh) && !/就来找|就来了吗/.test(cur)) {
            cur = cur.replace(RE.comingSoonG, T.shootCumZh);
            note('domain_term');
        }

        // Invented anatomy / climax ZH with no matching JA cue (ADN-798 / SNOS-293)
        const jaHasRod = RE.jaHasRodSrc.test(src);
        const zhHadClinicalRod = RE.clinicalRodZhSrc.test(before);
        if (RE.meatRodSrc.test(cur) && !jaHasRod && !zhHadClinicalRod) {
            const next = cur
                .replace(RE.dadRodSoG, T.dadRodSoOkZh)
                .replace(RE.dadRodG, T.dadOkZh)
                .replace(RE.ofMeatRodG, '的')
                .replace(RE.meatRodG, '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').trim();
                note('domain_hallucination');
            }
        }
        if (RE.cockSrc.test(cur) && !jaHasRod && !zhHadClinicalRod) {
            const next = cur
                .replace(RE.thatCockG, T.thatSideZh)
                .replace(RE.ofCockG, '的')
                .replace(RE.cockG, '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').replace(/…+/g, '…').trim();
                note('domain_hallucination');
            }
        }
        if (RE.limpMataSrc.test(src) && RE.climaxHallucZhSrc.test(cur)) {
            cur = /[?？]/.test(src) || /[?？]/.test(cur) ? T.softAgainQZh : T.softAgainZh;
            note('domain_term');
        }

        return { text: cur, changed: cur !== before };
    }

    /**
     * High-confidence adult JA → ZH stubs (opaque). Used by sanitize remap / blank recovery.
     * @param {string} ja
     * @param {{ textLen?: (s: string) => number }} [opts]
     * @returns {string|null}
     */
    function remapAdultZhFromJa(ja, opts = {}) {
        const s = String(ja || '').trim();
        if (!s) return null;
        const bare = s.replace(/[。．.!！]+$/g, '');
        const len = typeof opts.textLen === 'function'
            ? opts.textLen
            : (t) => [...String(t || '').replace(/\s/g, '')].length;

        if (/^あはは|^ははは/.test(s) && RE.ahahaIkuSrc.test(s)) {
            return /[?？]/.test(s) ? T.ahahaIkuQZh : T.ahahaIkuZh;
        }
        if (RE.ikuRemapSrc.test(s) && len(s) <= 20) {
            return /[?？]/.test(s) ? T.aboutToCumQZh : T.aboutToCumPlainZh;
        }
        if (RE.ikuQOnlySrc.test(bare)) return T.aboutToCumQZh;
        if (RE.iachuiOrIkuChaSrc.test(s) && len(s) <= 12) {
            return /[?？]/.test(s) ? T.aboutToCumQZh : T.aboutToCumPlainZh;
        }
        if (RE.nakaDashitePlainSrc.test(s) && len(s) <= 12) return T.nakadashiOkZh;
        if (RE.mottoFukakuSrc.test(s) && len(s) <= 10) return T.deeperOkZh;
        if (/ちょっと/.test(s) && RE.ochinchinOrOhaSrc.test(s) && len(s) <= 16) {
            return FIX.ochinchinWaitOkZh || '';
        }
        if (RE.limpMataShortSrc.test(s) && len(s) <= 22) {
            return /[?？]/.test(s) ? T.softAgainQZh : T.softAgainZh;
        }
        if (RE.pinpinErectSrc.test(s) && len(s) <= 22) return T.pinpinOkZh;
        if (RE.rodSuggoiSrc.test(s) && len(s) <= 24) return T.rodAmazingZh;
        if (RE.isOchinDeshoSrc.test(s) && len(s) <= 16) return T.isRodQZh;
        if (srcHas(s, T.kichinchinLineJa) || (/きちんちん|おちんちん/.test(s) && len(s) <= 12 && /あ/.test(s))) {
            return T.kichinchinOkZh;
        }
        if (s.includes(T.chinCutJa) || s.includes(T.chinIkuNeJa)) return T.chinIkuNeOkZh;
        if (s.includes(T.wantInsertRodJa) || /おちんちん入れたくなって/.test(s)) {
            return T.wantInsertRodOkZh;
        }
        if (s.includes(T.footGrindJa)) return T.footGrindOkZh;
        if (s.includes(T.alsoFellaJa) || /^あと[、,，]?\s*フェラ/.test(s)) return T.alsoFellaOkZh;
        if (s.includes(T.anIkuJa) || (/イク|いく/.test(s) && /あん/.test(s) && len(s) <= 12)) {
            return T.aboutToCumPlainZh;
        }
        if (s.includes(T.horaLickJa) || (/舐めて/.test(s) && /ほら|から/.test(s) && len(s) <= 28)) {
            return T.horaLickOkZh;
        }
        if (/舐めて/.test(s) && /もっと|こっち|いっぱい/.test(s) && len(s) <= 32) {
            return T.moreLickOkZh;
        }
        if (/舐めて/.test(s) && /初めて/.test(s) && len(s) <= 28) {
            return T.firstLickOkZh;
        }
        if (/^(?:らめらめ|ラメラメ)[…。．.!！?\s]*$/u.test(s.trim())) {
            return T.dameDameZh;
        }
        if (/おつきで|おっきくて/.test(s) && len(s) <= 12) {
            return T.bigOkZh;
        }
        if (RE.ikuRepeatSrc.test(s) && len(s) <= 24) {
            return T.aboutToCumPlainZh;
        }
        if (RE.ikuTruncSrc.test(s) && len(s) <= 16) {
            return /[?？]/.test(s) ? T.aboutToCumQZh : T.aboutToCumPlainZh;
        }
        return null;
    }

    function srcHas(s, token) {
        return token && String(s || '').includes(token);
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
        hiraChinJa: d('5YGl44Gh44KD44KT44Gu44Gh44KT44Gh44KT44GL44CC'),
        hiraChinBadZh: d('5YGl55qE5bCP6bih6bih'),
        hiraChinOkZh: d('5YGl55qE6bih5be0'),
        ikuSouJa: d('44Kk44OD44Gh44KD44GE44Gd44GG'),
        ikuSouBadZh: d('6KaB5bCE5LqG'),
        ikuSouOkZh: d('6KaB5Y675LqG'),
        ikaSareJa: d('44GZ44GQ44Kk44GL44GV44KM44Gh44KD44GE44Gd44GG44CC'),
        ikaSareBadZh: d('6ams5LiK5bCx6KaB5bCE5LqG'),
        ikaSareOkZh: d('6ams5LiK5bCx6KaB5Y675LqG'),
        ballsChinJa: d('44Gh44KT44Gh44KT44KB44Gh44KD44GP44Gh44KD54ax44GP44Gq44Gj44Gm44GN44Gm44KL44KI44CC'),
        ballsChinBadZh: d('6JuL6JuL54Ot5b6X5LiN5b6X5LqG'),
        ballsChinOkZh: d('6bih5be054Ot5b6X5LiN5b6X5LqG'),
        torottoroJaFix: d('44Go44KN44Gj44Go44KN44Gr44Gq44Gj44Gm44KL44Gq44CC'),
        torottoroBadZh: d('6L2v57u157u15Zyw5a2X5bmV5Lit55qE5qih57OK5oiW6KKr6YGu5oyh55qE5paH5a2X'),
        torottoroOkZh: d('5rm/5ryJ5ryJ5Zyw'),
        ouchinJa: d('44Gt44GI44GK44GG44Gh44KT44Gh44KT5YWl44KM44Gf44KJ44Gp44GG44Gq44Gj44Gh44KD44GG44GT44KM'),
        ouchinFixed: d('44Gt44GI44GK44Gh44KT44Gh44KT5YWl44KM44Gf44KJ44Gp44GG44Gq44Gj44Gh44KD44GG44GT44KM'),
        ouchinBadZh: d('5ZaC77yM5L2g6L+Z5bCP6bih6bih5o+S6L+b5Y675Lya5oCO5LmI5qC3'),
        ouchinOkZh: d('5ZaC77yM5L2g6L+Z6bih5be05o+S6L+b5Y675Lya5oCO5LmI5qC3'),
        blankIkuJa: d('44GC44GC44KE44Gw44GE44KE44Gw44GE44GC44GC44KC44GG44G+44Gf44Kk44OD44Gh44KD44GG44KI44GT44KT44Gq44Gv'),
        blankIkuOkZh: d('6KaB5Y675LqG'),
        // CAWD-999 / ADN-801 fixtures
        chinpoMilkJa: d('44Gv44GC44GK44Gh44KT44G944Of44Or44Kv44Gf44GP44GV44KT5Ye644GX44Gm44GC44GS44KL44GL44KJ44Gt'),
        chinpoMilkBadZh: d('5ZOI77yM57uZ5L2g5aSa5Ye654K55aW25rC077yM5aW95ZCX77yf'),
        chinpoMilkOkZh: d('5ZOI77yM57uZ5L2g5aSa5Ye654K557K+5ray77yM5aW95ZCX77yf'),
        cantHoldMilkJa: d('44Gh44KH44Gj44Go44KC44GG5oiR5oWi44Gn44GN44Gq44GE44Gn44GK44Gh44KT44G944Of44Or44Kv5Ye644GZ44GL44KJ44Gt44CC'),
        cantHoldMilkBadZh: d('56iN5b6u5YaN5b+N6ICQ5LiA5LiL77yM5oiR6ams5LiK5bCx6KaB5bCE57K+5LqG5ZOm'),
        cantHoldMilkOkZh: d('5b+N5LiN5L2P5LqG77yM6bih5be057K+5ray6KaB5bCE5Ye65p2l5LqG5ZOm'),
        viewSpurtJa: d('44GE44Gj44Gx44GE44GK44Gh44KT44G944OT44Ol44O85Ye644GZ44GL44KJ44Gt44CC'),
        viewSpurtBadZh: d('5oiR5Lya5aSa57uZ5L2g55yL5Yeg5qyh'),
        viewSpurtOkZh: d('5Lya5aSn6YeP5bCE5Ye65p2l55qE5ZOm44CC'),
        choudaiHallJa: d('44Gq44GK44GP44KT44G+44Gn44Gh44KH44GG44Gg44GE44Gq44GK44GP44KT44G+44Gn44Gh44KH44GG44Gg44GE'),
        choudaiHallBadZh: d('5oqK5L2g55qE5bCP6bih6bih5Lmf5byE56Gs54K577yM5oqK5L2g55qE5bCP6bih6bih5Lmf5byE56Gs54K5'),
        choudaiHallOkZh: d('5rGC5L2g57uZ5oiR77yM5rGC5L2g57uZ5oiR'),
        ittaJa: d('44GC44KT44Gf44Kk44OD44Gh44KD44Gj44Gf44KT44Gn44GZ44GL44GtPw=='),
        ittaBadZh: d('5L2g5piv5LiN5piv5bey57uP5bCE5LqG77yf'),
        ittaOkZh: d('5L2g5piv5LiN5piv5bey57uP5Y675LqG77yf'),
        ikitaiJa: d('44Gm44Gj44Gh44KD44KT5Ye644Gh44KD44GGPyDjgYbjgpPooYzjgY3jgZ/jgYQ/'),
        ikitaiBadZh: d('6KaB5bCE5LqG5ZCX77yfIOWXr++8jOaDs+WwhO+8nw=='),
        ikitaiOkZh: d('6KaB5bCE5LqG5ZCX77yfIOWXr++8jOaDs+WOu++8nw=='),
        ikuBareJa: d('6KGM44GP4oCm44GC44Gh44KH44Gj44G+44Gg'),
        ikuBareBadZh: d('6KaB5bCE5LqG4oCm5ZWK77yM'),
        ikuBareOkZh: d('6KaB5Y675LqG4oCm5ZWK77yM'),
        arigatouHaiJa: d('44Gv44GE44CB44GC44KK44GM44Go44GG44Gv44O844GE'),
        arigatouHaiOkZh: d('5aW955qE77yM6LCi6LCi'),
        mouDameJa: d('44GC44GC44KC44GG44OA44Oh'),
        mouDameOkZh: d('5ZWK77yM5bey57uP5LiN6KGM5LqG'),
        kimochiWaruiJa: d('44GC44CB44GC44Gu44CB5rCX5oyB44Gh5oKq44GZ44GO44KL44GL44KC44GX44KM44G+44Gb44KT44CC'),
        kimochiWaruiOkZh: d('5Y+v6IO95oG25b+D6L+H5aS05LqG'),
        moanBlankJa: d('44GC44Gj44CB44GC44Gj44CB44GC44GjIQ=='),
        moanBlankOkZh: d('5ZWK4oCU4oCU77yB'),
        // ADN-798 / ADN-791 / residual CAWD-999 / ADN-801
        chinpaMilkJa: d('44OB44Oz44OR44Of44Or44Kv44Gf44GP44GV44KT5Ye644GX44Gm44GC44GS44KL44GL44KJ44Gt'),
        chinpaMilkBadZh: d('5oiR5Lya5aSa57uZ5L2g5oyk5Lqb54mb5aW255qE'),
        chinpaMilkOkZh: d('5oiR5Lya5aSa57uZ5L2g5oyk5Lqb57K+5ray55qE'),
        chinpaMilkFixedJa: d('44GK44Gh44KT44G944Of44Or44Kv44Gf44GP44GV44KT5Ye644GX44Gm44GC44GS44KL44GL44KJ44Gt'),
        coatMilkJa: d('44Kz44O844OI44KC44GG5oiR5oWi44Gn44GN44Gq44GE44GT44Gj44Gh44Gr44KC44Of44Or44Kv5Ye644GZ44GL44KJ44Gt'),
        coatMilkBadZh: d('5aSW5aWX5oiR5b+N5LiN5L2P5LqG6L+Z6L655Lmf6KaB5oyk5Ye65aW25p2l'),
        coatMilkOkZh: d('5oiR5b+N5LiN5L2P5LqG6L+Z6L655Lmf6KaB5bCE5Ye657K+5ray5p2l'),
        coatMilkFixedJa: d('44Gh44KH44Gj44Go44KC44GG5oiR5oWi44Gn44GN44Gq44GE44GT44Gj44Gh44Gr44KC44Of44Or44Kv5Ye644GZ44GL44KJ44Gt'),
        hardOchinJa: d('44K544Kr44Kk44Oz44OB44Gu44GK44Gh44KT44G9'),
        hardOchinBadZh: d('55qu6IKk5LiK55qE56Gs5Lic6KW/'),
        hardOchinOkZh: d('6bih5be0'),
        nakadashiSexJa: d('6YOo6ZW344CB56eB44Go5LmF44GX44G244KK44Gr5Luy5Ye644GX44K744OD44Kv44K544GX44Gf44GE44Gn44GZ44GLPw=='),
        nakadashiSexBadZh: d('6YOo6ZW/77yM5L2g5piv5LiN5piv5oOz5ZKM5oiR6YeN5rip5pen5oOF77yf'),
        nakadashiSexOkZh: d('6YOo6ZW/77yM5L2g5piv5LiN5piv5oOz5ZKM5oiR5Lit5Ye65YGa54ix77yf'),
        nakadashiSexFixedJa: d('6YOo6ZW344CB56eB44Go5LmF44GX44G244KK44Gr5Lit5Ye644GX44K744OD44Kv44K544GX44Gf44GE44Gn44GZ44GLPw=='),
        seedSexJa: d('56eB44Gf44Gh44Gv56iu5LuY44GR44K744OD44Kv44K544GX44Gm44G+44GZ'),
        seedSexBadZh: d('5oiR5Lus5Zyo6L+b6KGM57mB5q6W5oCn6KGM5Li6'),
        seedSexOkZh: d('5oiR5Lus5Zyo5pKt56eN5YGa54ix'),
        ikuStartJa: d('6KGM44GP'),
        ikuStartBadZh: d('6KaB5byA5aeL5LqG4oCm5ZWK5ZWK'),
        ikuStartOkZh: d('6KaB5Y675LqG4oCm5ZWK5ZWK'),
        dashichauComeJa: d('5Ye644Gh44KD44GG44KI'),
        dashichauComeBadZh: d('5p2l5LqG'),
        dashichauComeOkZh: d('6KaB5bCE5LqG'),
        sefriLineJa: d('5b285rCP44GY44KD44Gq44GE44Gn44GZ5b285rCP44Gq44GE44Gn44GZ44K744OV44Os44Gn44GZ'),
        sefriLineBadZh: d('5oiR5LiN5piv55S35pyL5Y+L77yM5rKh5pyJ55S35pyL5Y+L77yM'),
        sefriLineOkZh: d('5oiR5LiN5piv55S35pyL5Y+L77yM5rKh5pyJ55S35pyL5Y+L77yM5piv54Ku5Y+L'),
        kintamaTestJa: d('6YeR546J44Gr5rqc44G+44Gj44Gm44KL'),
        kintamaTestBadZh: d('6YO95Zyo552+5Li46YeM56ev552A'),
        kintamaTestOkZh: d('6YO95Zyo6JuL6JuL6YeM56ev552A'),
        ugokanaiBlankJa: d('5YuV44GL44Gq44GE'),
        ugokanaiBlankOkZh: d('5LiN5Yqo'),
        lickDadJa: d('44KC44GG44GT44KM5Lul5LiK6IiQ44KB44KJ44KM44Gf54i244GV44KT5Ye644Gh44KD44GG44KI'),
        lickDadBadZh: d('576O5oG15L2g5Lmf6KaB6K6p5oiR5Zad5bCP5aeQ55qE5aW2'),
        lickDadOkZh: d('5YaN6KKr6L+Z5qC36IiU5bCx6KaB5bCE5LqG'),
        // Capability expansion fixtures
        zecchouJa: d('57W26aCC44GX44Gd44GG'),
        zecchouBadZh: d('5bGx6aG26KaB5Yiw5LqG'),
        zecchouOkZh: d('6auY5r2u6KaB5Yiw5LqG'),
        erectLineJa: d('44KC44GG5YuD6LW344GX44Gm44KL'),
        erectLineBadZh: d('5bey57uP5Y+R5oCS5LqG'),
        erectLineOkZh: d('5bey57uP56Gs5LqG'),
        nakaOnlyJa: d('5Lit5Ye644GX44GX44Gm'),
        nakaOnlyBadZh: d('6YeN5rip5pen5oOF5ZCn'),
        nakaOnlyOkZh: d('5Lit5Ye65YGa54ix5ZCn'),
        nakaInJa: d('5Lit44Gr5Ye644GX44Gm'),
        nakaInBadZh: d('5b6A6YeM6Z2i5pS+'),
        nakaInOkZh: d('5bCE5Zyo6YeM6Z2i'),
        fellaLineJa: d('44OV44Kn44Op44GX44Gm'),
        fellaLineBadZh: d('5YGa5Liq5ryU56S6'),
        fellaLineOkZh: d('5Y+j5Lqk'),
        kunniLineJa: d('44Kv44Oz44OL44GX44Gm'),
        kunniLineBadZh: d('5piG5LuR5LiA5LiL'),
        kunniLineOkZh: d('6IiU5bCP56m05LiA5LiL'),
        tekokiLineJa: d('5omL44Kz44Kt44GX44Gm'),
        tekokiLineBadZh: d('5YGa5omL5bel'),
        tekokiLineOkZh: d('5omL5Lqk'),
        shioLineJa: d('5r2u5ZC544GN44Gd44GG'),
        shioLineBadZh: d('5r2u5rGQ6KaB5p2l5LqG'),
        shioLineOkZh: d('5r2u5ZC56KaB5p2l5LqG'),
        gokkunLineJa: d('44GU44Gj44GP44KT44GX44Gm'),
        gokkunLineBadZh: d('5ZKV5ZKa5LiA5Y+j'),
        gokkunLineOkZh: d('5ZCe57K+'),
        mangoLineJa: d('44GK44G+44KT44GT6Kem44Gj44Gm'),
        mangoLineBadZh: d('5pG45pG46IqS5p6c'),
        mangoLineOkZh: d('5pG45pG45bCP56m0'),
        samenLineJa: d('44K244O844Oh44Oz5Ye644Gf'),
        samenLineBadZh: d('5a2Q5a2Z5Ye65p2l5LqG'),
        samenLineOkZh: d('57K+5ray5Ye65p2l5LqG'),
        yameteBlankJa: d('44KE44KB44Gm'),
        yameteBlankOkZh: d('5LiN6KaB'),
        ireteBlankJa: d('5YWl44KM44Gm'),
        ireteBlankOkZh: d('6L+b5p2l'),
        fukakuBlankJa: d('44KC44Gj44Go5rex44GP'),
        fukakuBlankOkZh: d('5YaN5rex5LiA54K5'),
        ikuQBlankJa: d('44Kk44Kv77yf'),
        ikuQBlankOkZh: d('6KaB5Y675LqG5ZCX77yf'),
        fellaAsrJa: d('44OV44Kn44Op44O8'),
        fellaAsrFixed: d('44OV44Kn44Op'),
        tekokiAsrJa: d('5omL44GT44GN'),
        tekokiAsrFixed: d('5omL44Kz44Kt'),
        // FNS/HODV/YUJ residual expansion
        ikuGrandpaJa: d('44KC44GG5LiA5bqm44KE44KJ44Gq44GE44Gn44Gj4oCm44Kk44OD44Gh44KD44GG44Gu44Gg44KB44GH44Gj4oCmIQ=='),
        ikuGrandpaBadZh: d('5ZWK44CB54i354i35Zac5qyi55qE5ZOq6YeM6YO96KGM'),
        ikuGrandpaOkZh: d('5ZWK77yM5LiN6KaB5YaN5p2l5LqG77yM6KaB5Y675LqG5LiN6KGM5LqG'),
        omankoPrivateJa: d('44GG44KT44OA44Oh44Gg44KI44Gh44KD44KT44Go44GK44G+44KT44GT6IiQ44KB44Gq44GN44KD'),
        omankoPrivateBadZh: d('5L2g5aaI55qE56eB5aSE'),
        omankoPrivateOkZh: d('5LiN6KGM77yM6KaB5aW95aW96IiU5bCP56m0'),
        omankoPrivateSoftOkZh: d('5L2g5aaI55qE5bCP56m0'),
        heixiuLineBadZh: d('5ZOI5ZWK77yM5ZOI5ZWK77yM5ZWK5ZWK4oCm5Zi/5ZK75oiR5Lmf6KaB77yM6KaB5Y675LqG'),
        heixiuLineOkZh: d('5ZOI5ZWK77yM5ZOI5ZWK77yM5ZWK5ZWK4oCm5YGa54ix5oiR5Lmf6KaB77yM6KaB5Y675LqG'),
        heixiuLineJa: d('44GC44GC'),
        belowThingBadZh: d('5ZWK77yM6IiU5LiL6Z2i6YKj5Liq5Lic6KW/77yM5LiL6Z2i5pu056Gs5LqG'),
        belowThingOkZh: d('5ZWK77yM6IiU6bih5be077yM5LiL6Z2i5pu056Gs5LqG'),
        sefriFalseJa: d('44GT44KM44GM44K744OV44Os5omx44GE44Gj44Gm44GT44Go44GL44CC'),
        sefriFalseZh: d('6KaB5oCO5LmI5omN6IO96K6p5YmN55S35Y+L5Zue5aS077yf'),
        erectShootJa: d('44GX44Gm5YuD6LW344GX44Gm44Gq44GE44KI44Gt44Gv44GCPw=='),
        erectShootBadZh: d('5bey57uP5bCE5LqG77yfIOS9oOaDs+WwhO+8nw=='),
        erectShootOkZh: d('5rKh5pyJ56Gs6LW35p2l5ZCn77yfIOWTiO+8nw=='),
        milkOnlyJa: d('44Of44Or44Kv44Gf44GP44GV44KT5Ye644GX44Gm44GC44GS44KL'),
        milkOnlyBadZh: d('5oiR5Lya5aSa57uZ5L2g5oyk5Lqb54mb5aW2'),
        milkOnlyOkZh: d('5oiR5Lya5aSa57uZ5L2g5oyk5Lqb57K+5ray'),
        ojiChinAsrJa: d('44GK44GY44GE44Gh44KD44KT44Gh44KT'),
        ojiChinAsrFixed: d('44GK44Gh44KT44Gh44KT'),
        // ADN-791 residuals
        itchaunStartJa: d('44GE44Gh44KD44GG44CB6ZaL44GE44Gh44KD44GG44CC'),
        itchaunStartBadZh: d('6KaB5byA5aeL5LqG77yM'),
        itchaunStartOkZh: d('6KaB5Y675LqG77yM6KaB5byg5byA5LqG'),
        ikuDoneJa: d('44Kk44Kv44ODIQ=='),
        ikuDoneBadZh: d('6KGM5LqG77yB'),
        ikuDoneOkZh: d('6KaB5Y675LqG77yB'),
        chinPenisJa: d('44GK44Gh44KT44G944OT44Kv44OT44Kv44Gj44Gm44CC'),
        chinPenisBadZh: d('6Zi06IyO6YO95Zyo6aKk5oqW'),
        chinPenisOkZh: d('6IKJ5qOS6YO95Zyo6aKk5oqW'),
        iretePleaseJa: d('5YWl44KM44Gm44GP44Gg44GV44GE'),
        iretePleaseBadZh: d('6K+36L+b'),
        iretePleaseOkZh: d('6K+35o+S6L+b5p2l'),
        jugyouAsrJa: d('44GC44GC44CB5o6I5qWt5LiL44GM44Gj44Gm44GN44Gh44KD44GG44CB5rCX5oyB44Gh44GE44GE44CC'),
        jugyouAsrFixed: d('44GC44GC44CB5a2Q5a6u5LiL44GM44Gj44Gm44GN44Gh44KD44GG44CB5rCX5oyB44Gh44GE44GE44CC'),
        jugyouBadZh: d('5ZWK77yM5LiK6K++6KaB5byA5aeL5LqG77yM'),
        jugyouOkZh: d('5ZWK77yM5a2Q5a6r6KaB6ZmN5LiL5p2l5LqG77yM'),
        dechaiJa: d('44Gn44Gh44KD44GE44CB44Gn44Gh44KD44GE44CB44Gn44Gh44KD44GE4oCm44Gg44KB44Gg44KB44CB44Gg44KB4oCm'),
        dechaiFixed: d('5Ye644Gh44KD44GE44CB5Ye644Gh44KD44GE44CB5Ye644Gh44KD44GE4oCm44Gg44KB44Gg44KB44CB44Gg44KB4oCm'),
        dechaiBadZh: d('5bCx5p2l44CB5bCx5p2l44CB5bCx5p2l4oCm5LiN6KGM5LiN6KGM44CB5LiN6KGM'),
        dechaiOkZh: d('6KaB5bCE5LqG44CB6KaB5bCE5LqG44CB6KaB5bCE5LqG4oCm5LiN6KGM5LiN6KGM44CB5LiN6KGM'),
        kuchunBlankJa: d('4oCm44GP44Gh44KF44KT'),
        kuchunBlankOkZh: d('5ZKV5ZW+'),
        // MIDA-762 residuals
        maleGenitalJa: d('44GK5aW944GN44Gn44GZ44GL44CB44GK44Gh44KT44Gh44KT44Gv'),
        maleGenitalBadZh: d('5L2g5Zac5qyi5L2g55qE55S35oCn55Sf5q6W5Zmo'),
        maleGenitalOkZh: d('5L2g5Zac5qyi5L2g55qE6IKJ5qOS'),
        dekaSizeJa: d('44OH44Kr44OB44Oz5qyy44GX44GEPw=='),
        dekaSizeBadZh: d('5oOz6KaB5aSn5bC65a+455qE77yf'),
        dekaSizeOkZh: d('5oOz6KaB5aSn6IKJ5qOS55qE77yf'),
        kintamaEpiJa: d('6YeR546J44GM44Gk44GE44Gm44KL44KT44Gn44GZ44CC'),
        kintamaEpiBadZh: d('5pyJ6ZmE552+'),
        kintamaEpiOkZh: d('5pyJ6JuL6JuL'),
        porchioLineJa: d('44KI44KK44Od44Or44OB44Kq44Gr5bGK44GP44KI44GG44Gr44Gq44Gj44Gf5oSf44GY44Gn44GZ44CC'),
        porchioBadZh: d('5oSf6KeJ5pu06Z2g6L+R5LqG6Zi06IyO5aS0'),
        porchioOkZh: d('5oSf6KeJ5pu06Z2g6L+R5LqG5a2Q5a6r5Y+j'),
        omankoPenisJa: d('44Gq44KT44GL44CB44GK44G+44KT44GT44Oz44Gr44Gq44Gj44Gh44KD44GE44G+44GZ44CC'),
        omankoPenisBadZh: d('5oSf6KeJ5aW95YOP5Y+Y5oiQ5LqG6Zi06IyO'),
        omankoPenisOkZh: d('5oSf6KeJ5aW95YOP5Y+Y5oiQ5LqG5bCP56m0'),
        kachinGenitalJa: d('44Kr44OB44Oz44GU5a++6Z2i44Gj44Gm5oSf44GY44Gn44GE44GE44Gn44GX44KH44GG44GL44GK5ZG844Gz44GX44Gm44KC44CC'),
        kachinGenitalBadZh: d('55S35oCn55Sf5q6W5Zmo6KeB6Z2i5LqG44CC5aaC5p6c5Y+r55qE6K+d'),
        kachinGenitalOkZh: d('6IKJ5qOS6KeB6Z2i5LqG44CC5aaC5p6c5Y+r55qE6K+d'),
        compoundGenitalBadZh: d('5aSn5bC65a+455qE55S35oCn55Sf5q6W5Zmo5Y+v5Lul55yL55yL6L+Z5Liq'),
        compoundGenitalOkZh: d('5aSn6IKJ5qOS5Y+v5Lul55yL55yL6L+Z5Liq'),
        dadRodLineZh: d('5piv54i454i455qE6IKJ5qOS77yM5omA5Lul5rKh5YWz57O755qE'),
        clinicalRubZh: d('5pGp5pOm55S35oCn55Sf5q6W5Zmo5oSf6KeJ6IiS5pyN5ZCX77yf'),
        chinpoRubJa: d('44GK44Gh44KT44G944KS44GT44GZ44KL5rCX5oyB44Gh44GE44GE44KT44Gn44GZ44GLPw=='),
        dualClinicalZh: d('6L+Z5aSn5bC65a+455qE55S35oCn55Sf5q6W5Zmo6L+b5Y675Lya5oCO5LmI5qC377yf'),
        dualClinicalJa: d('44GT44Gu5aSn44GN44GE44GK44Gh44KT44Gh44KT44GM5YWl44Gj44Gf44KJ44Gp44GG44Gq44Gj44Gh44KD44GGPw=='),
        dualClinicalOkZh: d('6L+Z5aSn6IKJ5qOS6L+b5Y675Lya5oCO5LmI5qC377yf'),
        limpAsrJa: d('44GK44Gh44KT44G944GM44G+44Gf44Gj44Gh44KD44Gj44Gf44GuPw=='),
        limpFixedJa: d('6JCO44GI44Gh44KD44Gj44Gf'),
        climaxQZh: d('5b+r6auY5r2u5LqG5ZCX77yf'),
        cockHallucZh: d('6YKj6L6555qE6bih5be04oCm5ZWK5ZOf77yB'),
        airiJa: d('44GC44GE44KK4oCm'),
        belowLickJa: d('44GK44Gh44KT44G96IiQ44KB44Gm'),
        sefriSexJaSuffix: d('44Gj44Gm44K744OD44Kv44K544GZ44KL44KT44GY44KD44Gq44GE44GuPw=='),
        promptPenisMeta: d('5qC55o2u5Lul5LiL55qE6Iux5paH5Y+l5a2Q77yM5YaZ5Ye656ys5Zub5Liq5Y2V6K+N5piv44CM6Zi06IyO44CN77yM5L2G5LiN6IO95piv5ZCM6Z+z5byC5LmJ6K+N44CC56ys5Zub5Liq5Y2V6K+N5Y+q5pyJ5LiA56eN5Y+v6IO9'),
        shootWantDoneZh: d('6KaB5bCE5LqG'),
        pinpinLineJa: d('44GZ44GT44GE44OU44Oz44OU44Oz44Gr5YuD44Gj44Gm44KL44Gt4oCm'),
        chinponMishearJa: d('44Gh44KT44G944KT4oCm44GZ44GU44GE5rCX5oyB44Gh44GE44GE4oCm'),
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

        // Short anatomy scrap after ASR
        if (
            RE.ochinchinOrOhaSrc.test(src)
            && /ちょっと/.test(src)
            && [...src.replace(/\s/g, '')].length <= 16
        ) {
            return FIX.ochinchinWaitOkZh;
        }

        // Nipple + anatomy erect hallucination blank
        if (
            src.includes(T.nippleJa)
            && RE.chinkoErectTouchSrc.test(src)
            && /触られ/.test(src)
        ) {
            return FIX.nippleChinkoOkZh;
        }

        // Climax / erect scraps blanked by refusal
        if (RE.ikuQBareSrc.test(src)) {
            return T.ikuQZh;
        }
        if (RE.climaxIkuSrc.test(src) || RE.itchaimasuSrc.test(src) || RE.ikuTruncSrc.test(src) || re('44Kk44OD44Gh44KD44GE44Gd44GGfOOCpOOBi+OBleOCjA==').test(src)) {
            return T.aboutToCumZh;
        }
        if (src.includes(T.horaLickJa) || (/舐めて/.test(src) && /ほら/.test(src))) {
            return T.horaLickOkZh;
        }
        if (src.includes(T.footGrindJa)) return T.footGrindOkZh;
        if (src.includes(T.wantInsertRodJa) || /おちんちん入れたくなって/.test(src)) {
            return T.wantInsertRodOkZh;
        }
        if (src.includes(T.chinCutJa) || src.includes(T.chinIkuNeJa)) return T.chinIkuNeOkZh;
        if (/きちんちん|おちんちん/.test(src) && [...src.replace(/\s/g, '')].length <= 12) {
            return T.kichinchinOkZh;
        }
        if (src.includes(T.alsoFellaJa) || /^あと[、,，]?\s*フェラ/.test(src)) {
            return T.alsoFellaOkZh;
        }
        if (RE.erectingSrc.test(src) && [...src.replace(/\s/g, '')].length <= 20) {
            return T.hardIntenseZh;
        }
        if (/^動かない[。．.!！]*$/u.test(src)) {
            return T.ugokanaiZh;
        }
        if (/^やめて[。．.!！]*$/u.test(src) || /^やめろ[。．.!！]*$/u.test(src)) {
            return T.yameteZh;
        }
        if (src.includes(T.nakaDashiteJa) && [...src.replace(/\s/g, '')].length <= 12) {
            return T.nakaDashiteZh;
        }
        if (RE.insertPunctSrc.test(src)) {
            return T.ireteZh;
        }
        if (RE.mottoFukakuSrc.test(src) && [...src.replace(/\s/g, '')].length <= 10) {
            return T.mottoFukakuZh;
        }
        // Wet oral SFX (くちゅん etc.) — leave blank; av_soft strips rather than glossing as 咕啾.
        if (/気持ちよすぎる/.test(src)) {
            return '好舒服过头了';
        }
        if (compact === String(FIX.arigatouHaiJa || '').replace(/\s+/g, '')) {
            return FIX.arigatouHaiOkZh;
        }
        if (/ありがとうはーい|ありがとう\s*はーい/.test(src) && [...src.replace(/\s/g, '')].length <= 18) {
            return FIX.arigatouHaiOkZh || '好的，谢谢';
        }
        if (compact === String(FIX.mouDameJa || '').replace(/\s+/g, '') || /^あ+もうダメ[。．.!！]*$/u.test(src)) {
            return FIX.mouDameOkZh;
        }
        if (/もうダメ|もうだめ/.test(src) && [...src.replace(/\s/g, '')].length <= 10) {
            return FIX.mouDameOkZh || '啊，已经不行了';
        }
        if (/気持ち悪すぎる/.test(src)) {
            return /かも|かもしれ/.test(src)
                ? (FIX.kimochiWaruiOkZh || '可能恶心过头了')
                : '恶心过头了';
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
                        ? `我${timeZh}都想和${partnerZh}${T.makeLoveZh}。`
                        : `我想和${partnerZh}${T.makeLoveZh}。`;
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
        remapAdultZhFromJa,
        shouldKeepOrphanStuckZh,
        recoverBlankAdultDialogue,
    };
}));
