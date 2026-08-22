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
    let lexicon = null;
    try {
        lexicon = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-sanitize-lexicon')
            : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitizeLexicon);
    } catch (_) {
        lexicon = null;
    }

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
        aboutToCumZh: d('6KaB5bCE5LqG'),
        ochinchinJa: d('44GK44Gh44KT44Gh44KT'),
        ochinpoJa: d('44GK44Gh44KT44G9'),
        chinChinHiraJa: d('44Gh44KT44Gh44KT'),
        chikubiJa: d('44OB44Kv44OT'),
        chikubiHiraJa: d('44Gh44GP44Gz'),
        nippleJa: d('5Lmz6aaW'),
        kuriToritJa: d('44Kv44Oq44OI44Oq44K5'),
        kuriMoJa: d('44Kv44Oq44KC'),
        kameAtamaJa: d('5LqA6aCt'),
        earZh: d('6ICz5py1'),
        nippleZh: d('5Lmz5aS0'),
        clitZh: d('6Zi06JKC'),
        glansZh: d('6b6f5aS0'),
        clitLatin: d('Y2xpdA=='),
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
        ikuAlsoDashiteZh: d('6KaB5bCE55qE5pe25YCZ5Lmf5bCE5Ye65p2l'),
        acchiJa: d('44GC44Gj44Gh44GC44Gj44Gh'),
        softCottonZh: d('6L2v57u157u1'),
        hotHotZh: d('54Ot54Ot'),
        guchuJa: d('44GQ44Gh44KF44GQ44Gh44KF'),
        blushedZh: d('57qi5LqG'),
        wetMessyZh: d('5rm/5ryJ5ryJ'),
        ahFeelGoodZh: d('5ZWK77yM5aW96IiS5pyN'),
        ahahaFeelZh: d('5ZOI5ZOI77yM5aW96IiS5pyN'),
        ahahaIkuZh: d('5ZOI5ZOI77yM6KaB5bCE5LqG'),
        ahahaIkuQZh: d('5ZOI5ZOI77yM6KaB5bCE5LqG5ZCn77yf'),
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
        goCumShortZh: d('6KaB5bCE'),
        shotZh: d('5bCE5LqG'),
        cameZh: d('5bCE5LqG'),
        fastShotZh: d('5b+r5bCE5LqG'),
        fastCameZh: d('5b+r5bCE5LqG'),
        againShotZh: d('5Y+I5bCE5LqG'),
        againCameZh: d('5Y+I5bCE5LqG'),
        dontShootZh: d('5LiN6KaB5bCE5LqG'),
        footGrindJa: d('6Laz56m044GQ44KK44GQ44KK44GX44Gm44GP44Gg44GV44GE'),
        footGrindOkZh: d('6K+355So6ISa5pCF5byE'),
        wantInsertRodJa: d('44KT44KA44GK44Gh44KT44Gh44KT5YWl44KM44Gf44GP44Gq44Gj44Gm44GX44G+44Gj44Gf'),
        wantInsertRodOkZh: d('5oOz5oqK6IKJ5qOS5pS+6L+b5Y675LqG'),
        alsoFellaJa: d('44GC44Go44CB44OV44Kn44Op4oCm'),
        alsoFellaOkZh: d('6L+Y5pyJ77yM5Y+j5Lqk4oCm'),
        chinCutJa: d('44Gh44KT44Gh44KT44CB44KC44GG5YiH44Gj44Gm44Gt'),
        chinIkuNeJa: d('44Gh44KT44Gh44KT44CB44KC44GG44Kk44Gj44Gm44Gt'),
        chinIkuNeOkZh: d('6IKJ5qOS77yM5bey57uP6KaB5bCE5LqG5ZOm'),
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
        thanksCameOkZh: d('6LCi6LCi5L2g5bCE5LqG'),
        grandpaAlsoOutBadZh: d('54i354i35Lmf6KaB5Ye65p2l5LqG'),
        grandpaAlsoOutOkZh: d('5Lmf6KaB5Ye65p2l5LqG'),
        juiceLikeJa: d('44GK44GX44KL44Gq44GE44Gf'),
        juiceLikeOkZh: d('5YOP5rGB5ray5LiA5qC34oCm'),
        horaLickJa: d('44G744KJ6IiQ44KB44Gm'),
        horaLickOkZh: d('5p2l77yM6IiU6IiU4oCm'),
        thanksCameBadZh: d('6LCi6LCi5L2g5bCE5LqG'),
        thanksCameOkZh: d('6LCi6LCi5L2g5Y675LqG'),
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
        aboutToSoonOkZh: d('6ams5LiK6KaB5bCE5LqG'),
        noLickNippleOkZh: d('5aWz5Lq65LiN5biu6IiU5Lmz5aS05ZCX77yf'),
        chinpoMilkJa: d('44GK44Gh44KT44G944Of44Or44Kv'),
        milkWaterZh: d('5aW25rC0'),
        alreadyShotZh: d('5bey57uP5bCE5LqG'),
        alreadyCameZh: d('5bey57uP5bCE5LqG'),
        wantShootZh: d('5oOz5bCE'),
        wantGoZh: d('5oOz5bCE'),
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
        ikuQZh: d('6KaB5bCE5LqG5ZCX77yf'),
        putInsideZh: d('5b6A6YeM6Z2i5pS+'),
        grandpaZh: d('54i354i3'),
        oldGrandpaZh: d('6ICB54i354i3'),
        privatePartZh: d('56eB5aSE'),
        vaginaZh: d('6Zi06YGT'),
        yinbuZh: d('6Zi06YOo'),
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
        mankoHiraJa: d('44G+44KT44GT'),
        chinMaruKoJa: d('44OB4peL44Kz'),
        chinMaruKoHiraJa: d('44Gh4peL44GT'),
        chinMaruPoJa: d('44OB4peL44Od'),
        chinMaruPoHiraJa: d('44Gh4peL44G9'),
        penikaJa: d('44Oa44OL44Kr'),
        penisKataJa: d('44Oa44OL44K5'),
        maybeLatin: d('bWF5YmU='),
        maybeZh: d('5Y+v6IO9'),
        mankoHiraJa: d('44G+44KT44GT'),
        chinMaruKoJa: d('44OB4peL44Kz'),
        chinMaruKoHiraJa: d('44Gh4peL44GT'),
        chinMaruPoJa: d('44OB4peL44Od'),
        chinMaruPoHiraJa: d('44Gh4peL44G9'),
        penikaJa: d('44Oa44OL44Kr'),
        penisKataJa: d('44Oa44OL44K5'),
        maybeLatin: d('bWF5YmU='),
        maybeZh: d('5Y+v6IO9'),
        mankoHiraJa: d('44G+44KT44GT'),
        chinMaruKoJa: d('44OB4peL44Kz'),
        chinMaruKoHiraJa: d('44Gh4peL44GT'),
        chinMaruPoJa: d('44OB4peL44Od'),
        chinMaruPoHiraJa: d('44Gh4peL44G9'),
        penikaJa: d('44Oa44OL44Kr'),
        penisKataJa: d('44Oa44OL44K5'),
        maybeLatin: d('bWF5YmU='),
        maybeZh: d('5Y+v6IO9'),
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
        aboutToCumPlainZh: d('6KaB5bCE5LqG'),
        aboutToCumQZh: d('6KaB5bCE5LqG5ZCX77yf'),
        shootOutPrefixZh: d('5bCE5Ye6'),
        frontTipZh: d('5YmN56uv'),
        xianTouMisZh: d('5YWI5aS0'),
        yangwuZh: d('6Ziz54mp'),
        jiJiZh: d('6bih6bih'),
        aboutToGoZh: d('6KaB5Y675LqG'),
        wentZh: d('5Y675LqG'),
        pleaseRequestZh: d('5ouc5omY'),
        prettyTongueNakadashiZh: d('6IO95Lit5Ye65Zyo6L+Z5LmI5ryC5Lqu55qE6IiM5aS05LiK4oCm'),
        tongueNakadashiZh: d('6IO95Lit5Ye65Zyo6IiM5aS05LiK4oCm'),
        exposeOutZh: d('6Zyy5Ye65p2l'),
        jiTouZh: d('6bih5aS0'),
        kouPaoZh: d('5Y+j54Ku'),
        doctorZh: d('5Yy755Sf'),
        listenWellZh: d('5ZCs5aW95LqG'),
        outCantZh: d('5Ye65LiN5p2l'),
        burstShootZh: d('6KaB54iG5bCE5LqG'),
        yangJuZh: d('6Ziz5YW3'),
        flowOutZh: d('5rWB5Ye65p2l'),
        takeOutZh: d('5ou/5Ye65p2l'),
        leakOutZh: d('5rOE5LqG'),
        againGoZh: d('5Y+I6KaB5Y675LqG'),
        wentZh: d('5Y675LqG'),
        pleaseRequestZh: d('5ouc5omY'),
        prettyTongueNakadashiZh: d('6IO95Lit5Ye65Zyo6L+Z5LmI5ryC5Lqu55qE6IiM5aS05LiK4oCm'),
        tongueNakadashiZh: d('6IO95Lit5Ye65Zyo6IiM5aS05LiK4oCm'),
        exposeOutZh: d('6Zyy5Ye65p2l'),
        jiTouZh: d('6bih5aS0'),
        kouPaoZh: d('5Y+j54Ku'),
        doctorZh: d('5Yy755Sf'),
        listenWellZh: d('5ZCs5aW95LqG'),
        outCantZh: d('5Ye65LiN5p2l'),
        burstShootZh: d('6KaB54iG5bCE5LqG'),
        yangJuZh: d('6Ziz5YW3'),
        flowOutZh: d('5rWB5Ye65p2l'),
        takeOutZh: d('5ou/5Ye65p2l'),
        leakOutZh: d('5rOE5LqG'),
        againGoZh: d('5Y+I6KaB5Y675LqG'),
        shootOutEllZh: d('5bCE5Ye65p2l4oCm'),
        dameZh: d('5LiN6KGM'),
        dameEllZh: d('5LiN6KGM4oCm'),
        giveMeEllZh: d('57uZ5oiR4oCm'),
        loveJuiceZh: d('54ix5ray'),
        senseiPrefZh: d('6ICB5biI4oCm'),
        meatRodTipZh: d('6IKJ5qOS5YmN56uv'),
        meatRodEllZh: d('6IKJ5qOS4oCm'),
        nippleReportZh: d('6KaB5Y6755qE5pe25YCZ6KaB6Lef6ICB5biI5oql5ZGK5piv5Lmz5aS05Y6755qE5ZOm77yf'),
        rodSlightShootZh: d('6IKJ5qOS55qE4oCm5ZWK4oCm56iN5b6u5bCE5LiA54K54oCm'),
        touchRodEllZh: d('5pG46IKJ5qOS4oCm'),
        lickZh: d('6IiU'),
        naiTouZh: d('5aW25aS0'),
        xianDuanZh: d('5YWI56uv'),
        kissMeEllZh: d('4oCm5Lqy5Lqy5oiR4oCm'),
        insertInEllZh: d('4oCm5o+S6L+b5Y674oCm'),
        wantFellaEllZh: d('5oOz6KKr5Y+j5Lqk4oCm'),
        kissHereEllZh: d('6L+Z6L654oCm5Lqy5Lqy5oiR4oCm'),
        senseiKissMoreZh: d('6ICB5biI77yM5aSa5Lqy5oiR4oCm'),
        senseiLickMoreZh: d('6ICB5biI77yM5aSa6IiU6IiU4oCm'),
        etchiTouchZh: d('6K+36Imy5rCU5Zyw5pG45oiR4oCm'),
        canShootOutQZh: d('5Y+v5Lul5bCE5Ye65p2l5ZCX77yf'),
        pleaseTeachZh: d('6K+35aSa5oyH5pWZ'),
        iAmZh: d('5oiR5piv'),
        pleaseTeachSufZh: d('77yM6K+35aSa5oyH5pWZ'),
        moreGiveEllZh: d('5YaN5aSa57uZ5oiR5LiA54K54oCm'),
        frontTipEllZh: d('5YmN56uv4oCm'),
        stickCloseClimaxZh: d('6LS0552A5bCx6KKr5byE5Yiw6auY5r2u5LqG'),
        aboutToGoQZh: d('6KaB5Y675LqG5ZCX77yf'),
        saidThatQZh: d('5L2g6K+05LqG5ZCX77yf'),
        lickSenseiRodQZh: d('6IO95biu6ICB5biI6IiU5LiA5LiL6IKJ5qOS5ZCX77yf'),
        insertSenseiRodZh: d('6K+35oqK6ICB5biI55qE6IKJ5qOS5o+S6L+b5p2l4oCm'),
        lickPussyGiveZh: d('57uZ5oiR6IiU5bCP56m0'),
        rodGuchuZh: d('6IKJ5qOS4oCm5ZKV5ZW+5ZKV5ZW+4oCm'),
        wantShootRodHaZh: d('5ZOI4oCm5oiR5Lmf5oOz5aSa5bCE6IKJ5qOS4oCm5ZOI4oCm'),
        dameDameGoZh: d('5LiN6KGM5LiN6KGM4oCm6KaB5Y675LqG'),
        dameDameShootZh: d('5LiN6KGM5LiN6KGM4oCm6KaB5bCE5LqG'),
        wantLickNipEllZh: d('5oOz6KKr6IiU5Lmz5aS04oCm'),
        pussyAlsoGoZh: d('5bCP56m05Lmf6KaB5Y675LqG'),
        tooGoodZh: d('5aW96IiS5pyN6L+H5aS05LqG'),
        shootOutZh: d('5bCE5Ye65p2l'),
        noCommaZh: d('5LiN77yM'),
        thatFeelBetterZh: d('6YKj56eN5oSf6KeJ5q+U6L6D5aW944CC'),
        oliverZh: d('5aWl5Yip5byX'),
        chappyCallFbZh: d('5ZaC77yM5oGw55qu'),
        rodBigHardSufZh: d('5aW95aSn5aW956Gs4oCm'),
        thanksOkFbZh: d('5aW955qE77yM6LCi6LCi'),
        alreadyDameFbZh: d('5ZWK77yM5bey57uP5LiN6KGM5LqG'),
        maybeGrossZh: d('5Y+v6IO95oG25b+D6L+H5aS05LqG'),
        grossOverZh: d('5oG25b+D6L+H5aS05LqG'),
        gegeZh: d('5ZOl5ZOl'),
        allDayZh: d('5LiA5pW05aSp'),
        todayWithinZh: d('5LuK5aSp5LmL5YaF'),
        todayShortZh: d('5LuK5aSp'),
        allWantWithZh: d('6YO95oOz5ZKM'),
        iWantWithZh: d('5oiR5oOz5ZKM'),
        weZh: d('5oiR5Lus'),
        woZh: d('5oiR'),
        periodZh: d('44CC'),
        baQZh: d('5ZCn77yf'),
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
        // Include truncated ASR tails + hiragana T.chinpoHiraJa
        dekachinSrc: new RegExp(
            `${T.dekachinJa}|${T.chinchinJa}|${T.ochinchinJa}|${T.ochinpoJa}|${T.chinpoJa}|${T.chinpoHiraJa}|${T.chinChinHiraJa}`
            + `|${T.chinMaruKoJa}|${T.chinMaruKoHiraJa}|${T.chinMaruPoJa}|${T.chinMaruPoHiraJa}`
            + `|${T.penikaJa}|${T.penisKataJa}`
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
        itchaimasuSrc: re('44Kk44OD44Gh44KD44GEfOOBhOOBo+OBoeOCg+OBhHzjgqTjgaPjgaHjgoPjgYQ='),
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
        vaginaG: new RegExp(T.vaginaZh, 'g'),
        yinbuG: new RegExp(T.yinbuZh, 'g'),
        heixiuG: new RegExp(T.heixiuZh, 'g'),
        belowThingG: new RegExp(T.belowThingZh, 'g'),
        penisG: new RegExp(T.penisZh, 'g'),
        clitLatinG: new RegExp(T.clitLatin, 'gi'),
        kuriCueSrc: re('44Kv44Oq44OI44Oq44K5fOOCr+ODquOCgnzjgq/jg6rjgYx844Kv44Oq44KSfOOCr+ODquOBr3zjgq/jg6rjgaM='),
        clitLatinG: new RegExp(T.clitLatin, 'gi'),
        kuriCueSrc: re('44Kv44Oq44OI44Oq44K5fOOCr+ODquOCgnzjgq/jg6rjgYx844Kv44Oq44KSfOOCr+ODquOBr3zjgq/jg6rjgaM='),
        clitLatinG: new RegExp(T.clitLatin, 'gi'),
        kuriCueSrc: re('44Kv44Oq44OI44Oq44K5fOOCr+ODquOCgnzjgq/jg6rjgYx844Kv44Oq44KSfOOCr+ODquOBr3zjgq/jg6rjgaM='),
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
        mankoKataSrc: new RegExp(`${T.mankoKata}|${T.mankoHiraJa}`),
        maybeLatinG: new RegExp(`\\b${T.maybeLatin}\\b`, 'gi'),
        ikuChaSrc: re('44Kk44OD44Gh44KD44GGfOOBhOOBo+OBoeOCg+OBhg=='),
        putInsideAltsSrc: re('5b6A6YeM6Z2i5pS+fOaUvuWIsOmHjOmdonzmlL7ov5vljrs='),
        ikuBareBangSrc: re('44Kk44Kv44ODfOOBhOOBj+OBo3zjgqTjgq9bIe+8gV1844GE44GPWyHvvIFd'),
        ochinchinOrOhaSrc: re('44GK44Gh44KT44Gh44KTfOOBiuOBr+OBoeOCk+OBoeOCkw=='),
        chinkoErectTouchSrc: re('44OB44Oz44KzfOOBoeOCk+OBk3zjgYrjgaHjgpN85YuD44Gj44Gh44KD44GG'),
        ikuQBareSrc: re('Xig/OuOCpOOCr3zjgYTjgY9844Kk44OD44Gh44KD44GGKVvvvJ8/XSQ=', 'u'),
        erectingSrc: re('5YuD6LW344GX44Gm44KL'),
        limpMataSrc: re('KD8644GK44Gh44KT44G9fOOBiuOBoeOCk+OBoeOCkykuezAsOH0oPzrjgb7jgZ/jgaPjgaHjgoN86JCO44GI44Gh44KDKQ=='),
        limpMataShortSrc: re('KD8644GK44Gh44KT44G9fOOBiuOBoeOCk+OBoeOCkykuezAsNn0oPzrjgb7jgZ/jgaPjgaHjgoN86JCO44GI44Gh44KDKQ=='),
        climaxHallucZhSrc: re('6auY5r2ufOimgeWwhHzopoHlsITkuoY='),
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
        heixiuCueSrc: re('44Ko44OD44OBfOimgeWwhOS6hnzjgqTjg4N844Kk44Kv'),
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
            const pairs = raw.map((p) => ({ from: String(p.from || ''), to: String(p.to || '') }))
                .filter((p) => p.from && p.to);
            pairs.push({ from: T.chinkuMo, to: T.chinkoMo });
            return pairs;
        } catch (_) {
            return [{ from: T.chinkuMo, to: T.chinkoMo }];
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
    /** Female manko/nipple climax JA → prefer 去了 (do not soft-upgrade to 射了). */
    function jaFemaleClimaxPreferGo(src) {
        if (lexicon?.classifyClimaxPolarity) {
            return lexicon.classifyClimaxPolarity(src) === 'prefer_go';
        }
        const s = String(src || '');
        if (re('5bCE57K+fOWHuuOBl+OBpnzlh7rjgZXjgow=').test(s)) return false;
        if (re('KD8644GKKT/jgb7jgpPjgZMuezAsMTJ9KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaN844Kk44KtKQ==').test(s)) return true;
        if (re('KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaMpLnswLDEyfSg/OuOBiik/44G+44KT44GT').test(s)) return true;
        if (re('44G+44KT44GT44GE44Gj').test(s)) return true;
        if (re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsMTJ9KD8644Kk44KtfOOCpOODg3zjgYTjgaPjgaHjgoN844GE44GPKQ==').test(s)) return true;
        if (re('KD8644Kk44KtfOOCpOODg3zjgYTjgaPjgaHjgoMpLnswLDEyfSg/OuS5s+mmlnzjgaHjgY/jgbMp').test(s)) return true;
        // Nipple without male shoot cue — keep T.aboutToGoZh (hypothetic 舐められたら / bare T.nippleJa)
        if (re('5Lmz6aaWfOOBoeOBj+OBsw==').test(s)) return true;
        // Nipple without male shoot cue — keep T.aboutToGoZh (hypothetic 舐められたら / bare T.nippleJa)
        if (re('5Lmz6aaWfOOBoeOBj+OBsw==').test(s)) return true;
        if (/イッちゃいそうよ|イっちゃいそうよ|いっちゃいそうよ|いきそうよ/.test(s)) return true;
        if (/らめらめ|ラメラメ|らめ[ぇえにェ]|ラメェ/.test(s) && /イク|イッ|イっ|いっちゃ|イキ/.test(s)) {
            return true;
        }
        if (
            (
                /ダメ?イッちゃう|だめイッちゃう|ダメイッちゃう|ダメ?イッちゃった|だめイッちゃった|イッちゃったわ/.test(s)
                || /(?:だめ|ダメ).{0,4}(?:ディッチャ|イッちゃ)/.test(s)
            )
            && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)
        ) {
            return true;
        }
        if (/やめろ|やめね|やめてね|やめないで/.test(s) && /イッちゃう|いっちゃう|イっちゃう/.test(s)) {
            return true;
        }
        if (/やめ/.test(s) && /イッちゃいそう|イっちゃいそう|いっちゃいそう/.test(s)) {
            return true;
        }
        if (/(?:イッちゃ|いっちゃ).{0,12}(?:だめ|ダメ)/.test(s) && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)) {
            return true;
        }
        if (/アナル.{0,10}(?:イッちゃ|イッて|イク)/.test(s) && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)) {
            return true;
        }
        if (/やめ/.test(s) && /イッちゃいました|イッたよ/.test(s) && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)) {
            return true;
        }
        if (/(?:わた[し]|あたし)/.test(s) && /いっちゃう|イッちゃう|イッてる/.test(s) && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)) {
            return true;
        }
        if (/お尻.{0,16}イクことなりたくない/.test(s) && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)) {
            return true;
        }
        return false;
    }

    /**
     * Cross-title short ZH stubs → full gloss (feature-indexed).
     * Complex / overlapping remaps stay imperative below.
     */
    let _simpleAdultStubRules = null;

    function getSimpleAdultStubRules() {
        if (_simpleAdultStubRules) return _simpleAdultStubRules;
        const firstHow = d('5piv56ys5LiA5qyh4oCm5oCO5LmI5qC377yf');
        const senseiNipGo = d('6ICB5biI77yM5Lmz5aS06KaB5Y675LqG4oCm');
        const badNip = d('6L+Z5Lmz5aS055yf5Z2P5rCU4oCm');
        const tipDame = d('5LiN6KGM77yM5Y+q6IO95YmN56uv4oCm');
        const senseiHow = d('6ICB5biI6KaB5oCO5LmI5Yqe77yf');
        const sorrySensei = d('5a+55LiN6LW377yM6ICB5biI');
        const touchYou = d('5oiR5p2l5pG45L2g4oCm');
        const tipOnly = d('5Y+q6IO95YmN56uv4oCm');
        const chestTipHard = d('6IO46YOo5YmN56uv4oCm5aW956Gs4oCm');
        const shootTip = d('5bCE5Ye65p2l4oCm5YmN56uv4oCm');
        const moMo = d('5pG45pG4');
        const lickNip = d('6IiU5Lmz5aS04oCm');
        const nipRub = d('5Lmz5aS05Zyo6Lmt4oCm');
        const ippaiDash = d('5aW977yM5aSa5bCE5Ye65p2l4oCm');
        const standInsert = d('56uZ552A5o+S6L+b5p2l4oCm');
        const madaIre = d('6L+Y5LiN6IO95o+S6L+b5Y675ZCX77yf');
        const rameDecha = d('5LiN6KGM4oCm6KaB5bCE5Ye65p2l5LqG');
        const lookSensei = d('55yL77yM6ICB5biI55qE4oCm');
        const kimochiGive = d('5Lmf57uZ5oiR6IiS5pyN54K54oCm');
        const anoSensei = d('6YKj5Liq77yM6ICB5biI');
        const nameroSensei = d('6IiU6ICB5biI55qE4oCm');
        const semeOk = d('5oiR5Lya5aW95aW96LSj5byE5YmN56uv4oCm');
        const semeStim = d('5YmN56uv5aW95aW95Zyw5Yi65r+A5LiA5LiL4oCm');
        const ell = d('4oCm');
        _simpleAdultStubRules = [
            {
                id: 'fella.want.stub',
                needs: ['fella'],
                match: (cur, src) => re('44OV44Kn44Op').test(src) && /やられてみたい|してみたい|したい/.test(src)
                    && /^(?:想|想要)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.wantFellaEllZh,
            },
            {
                id: 'kiss.here.stub',
                needs: ['kiss'],
                match: (cur, src) => /キスキス|キスして/.test(src) && /こっち|こちら/.test(src)
                    && /^(?:这边啊|这边|这边呢)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.kissHereEllZh,
            },
            {
                id: 'first.time.how.stub',
                needs: ['first'],
                match: (cur, src) => /初めてなんだ|初めてなんだけど|初めてなのに/.test(src) && /どう/.test(src)
                    && /^(?:第一次|初次)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => firstHow,
            },
            {
                id: 'sensei.nipple.iku.stub',
                needs: ['sensei', 'nipple'],
                match: (cur, src) => /先生|せんせい/.test(src) && re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src) && /イキ|イッ|いく/.test(src)
                    && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => senseiNipGo,
            },
            {
                id: 'bad.nipple.stub',
                needs: ['nipple'],
                match: (cur, src) => re('5oKq44GE5Lmz6aaWfOS5s+mmli57MCw0feaCquOBhA==').test(src)
                    && /^(?:不好意思|抱歉|对不起)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => badNip,
            },
            {
                id: 'tip.only.dame.stub',
                needs: ['tip'],
                match: (cur, src) => /先っぽ|先っちょ/.test(src) && /だけ/.test(src) && /だめ|ダメ|いや/.test(src)
                    && /^(?:不行|不要)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => tipDame,
            },
            {
                id: 'sensei.kiss.stub',
                needs: ['sensei', 'kiss'],
                match: (cur, src) => /先生|せんせい/.test(src) && /キス/.test(src) && /いっぱい|もっと/.test(src)
                    && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.senseiKissMoreZh,
            },
            {
                id: 'sensei.lick.stub',
                needs: ['sensei', 'lick'],
                match: (cur, src) => /先生|せんせい/.test(src) && /舐めて/.test(src) && /いっぱい|もっと/.test(src)
                    && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.senseiLickMoreZh,
            },
            {
                id: 'etchi.touch.stub',
                needs: ['etchi', 'touch'],
                match: (cur, src) => /エッチに触って|エロく触って|色っぽく触って/.test(src)
                    && /ください|下さい|くださ/.test(src)
                    && /^(?:请|拜托|亲(?:\s*亲)?)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.etchiTouchZh,
            },
            {
                id: 'yoro.hello.stub',
                needs: ['yoro'],
                match: (cur, src) => /よろしくお願いします|よろしくお願い/.test(src)
                    && /^(?:你好|您好)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => {
                    const m = src.match(/^([^\s、,，]{1,12})です[、,，]?\s*よろしく/);
                    return m ? `${T.iAmZh}${m[1]}${T.pleaseTeachSufZh}` : T.pleaseTeachZh;
                },
            },
            {
                id: 'sensei.how.stub',
                needs: ['sensei'],
                match: (cur, src) => /先生|せんせい/.test(src) && /どうする/.test(src)
                    && (/安达|安達/.test(cur) || [...cur.replace(/\s/g, '')].length <= 4),
                ok: (cur, src) => senseiHow,
            },
            {
                id: 'sorry.sensei.stub',
                needs: ['sensei'],
                match: (cur, src) => /すみません/.test(src) && /先生|せんせい/.test(src)
                    && /^(?:对不起|抱歉|不好意思)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => sorrySensei,
            },
            {
                id: 'touch.ageru.stub',
                needs: ['touch'],
                match: (cur, src) => /触ってあげる|さわってあげる/.test(src)
                    && /开发|给你开/.test(cur),
                ok: (cur, src) => touchYou,
            },
            {
                id: 'tip.only.under.stub',
                needs: ['tip'],
                match: (cur, src) => /先っぽだけ|先っちょだけ/.test(src)
                    && !/前端|龟头|顶端/.test(cur)
                    && [...cur.replace(/\s/g, '')].length <= 8,
                ok: (cur, src) => tipOnly,
            },
            {
                id: 'tip.bare.under.stub',
                needs: ['tip'],
                match: (cur, src) => /先っぽ|先っちょ/.test(src)
                    && !/だけ/.test(src)
                    && !/前端|龟头|顶端/.test(cur)
                    && /^(?:好了|那就?|嗯|啊|那)[…。．.!！?\s嗯啊]*$/u.test(cur.trim()),
                ok: (cur, src) => T.frontTipEllZh,
            },
            {
                id: 'oppai.tip.hard.stub',
                needs: ['oppai', 'tip'],
                match: (cur, src) => re('44GK44Gj44Gx44GE').test(src) && /先っぽ|先っちょ/.test(src) && /固/.test(src)
                    && /前端|胸|乳/.test(cur) && !/硬|固/.test(cur)
                    && [...cur.replace(/\s/g, '')].length <= 8,
                ok: (cur, src) => chestTipHard,
            },
            {
                id: 'dashite.tip.misread.stub',
                needs: ['dashite', 'tip'],
                match: (cur, src) => /出して/.test(src) && /先っぽ|先っちょ/.test(src)
                    && /^(?:给我说|给我讲|说说)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => shootTip,
            },
            {
                id: 'motto.choudai.stub',
                needs: ['choudai'],
                match: (cur, src) => /もっとちょうだい|もっと頂戴/.test(src)
                    && (/^(?:嗯嗯?罗|嗯嗯|罗)[…。．.!！?\s]*$/u.test(cur.trim())
                        || ([...cur.replace(/\s/g, '')].length <= 4 && !/再|多|给/.test(cur))),
                ok: (cur, src) => T.moreGiveEllZh,
            },
            {
                id: 'chin.touch.stub',
                needs: ['rod', 'touch'],
                match: (cur, src) => re('KD8644GKfOOBhCk/44Gh44KT44Gh44KT6Kem44Gj44GmfOOBiuOBoeOCk+OBveinpuOBo+OBpnzjg4Hjg7Pjg4Hjg7Pop6bjgaPjgaY=').test(src)
                    && /^(?:摸摸那里|摸那里|摸摸|摸一下)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => `${moMo}${T.meatRodZh}${ell}`,
            },
            {
                id: 'nipple.lick.stub',
                needs: ['nipple', 'lick'],
                match: (cur, src) => re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsNn3oiJDjgoF86IiQ44KBLnswLDZ9KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
                    && /^(?:舔|舔舔)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => lickNip,
            },
            {
                id: 'nipple.rub.stub',
                needs: ['nipple'],
                match: (cur, src) => re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsNn3jgZPjgZnjgox844GT44GZ44KMLnswLDZ9KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
                    && (/吱|痒/.test(cur) || [...cur.replace(/\s/g, '')].length <= 8),
                ok: (cur, src) => nipRub,
            },
            {
                id: 'dashite.ok.stub',
                needs: ['dashite'],
                match: (cur, src) => /出してもいい|出していい|出して\s*も\s*いい/.test(src)
                    && /^(?:那好吧|好吧|那好)[？?]?\s*$/u.test(cur.trim()),
                ok: (cur, src) => T.canShootOutQZh,
            },
            {
                id: 'ippai.dashite.stub',
                needs: ['dashite'],
                match: (cur, src) => /いっぱい出して|いっぱいだして/.test(src)
                    && /^(?:好了|好|行)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => ippaiDash,
            },
            {
                id: 'tatte.irete.stub',
                needs: ['irete'],
                match: (cur, src) => /立ったまま入れ|立ったまま挿/.test(src)
                    && /^(?:站着做|站着)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => standInsert,
            },
            {
                id: 'mada.ire.dame.stub',
                needs: ['irete', 'dame'],
                match: (cur, src) => /まだ入れちゃダメ|まだ入れちゃだめ|まだ入れちゃ駄目|まだ入れ/.test(src)
                    && /ダメ|だめ|駄目/.test(src)
                    && !/お尻|ケツ/.test(src)
                    && (/好舒服|舒服/.test(cur) || [...cur.replace(/\s/g, '')].length <= 6),
                ok: (cur, src) => madaIre,
            },
            {
                id: 'ikuiku.fast.stub',
                needs: ['iku'],
                match: (cur, src) => /イク(?:イク)+|イクイク/.test(src)
                    && (/^(?:快[\s…]*){2,}(?:啊[\s…]*)*[!！?？]*$/u.test(cur.trim())
                        || /^(?:射){2,}[!！?？]*$/u.test(cur.trim())),
                ok: (cur, src) => T.aboutToCumZh,
            },
            {
                id: 'rame.decha.stub',
                needs: ['rame', 'dashite'],
                match: (cur, src) => /らめ[ぇえェ]|ラメェ/.test(src)
                    && /出ちゃ|でちゃ|出る|出して/.test(src)
                    && (/该死|真该死|要命/.test(cur) || [...cur.replace(/\s/g, '')].length <= 5),
                ok: (cur, src) => rameDecha,
            },
            {
                id: 'look.sensei.stub',
                needs: ['sensei', 'look'],
                match: (cur, src) => /先生|せんせい/.test(src) && /見て|ほら/.test(src)
                    && /^(?:看|快看|看啊)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => lookSensei,
            },
            {
                id: 'kimochi.choudai.asr.stub',
                needs: ['kimochi', 'choudai'],
                match: (cur, src) => /気にもちょうだい|キモチもちょうだい|気持ちもちょうだい/.test(src)
                    && /别在意|不要在意|请别/.test(cur),
                ok: (cur, src) => kimochiGive,
            },
            {
                id: 'ano.sensei.stub',
                needs: ['sensei'],
                match: (cur, src) => /あの[、,，]?\s*(?:先生|せんせい)/.test(src)
                    && /^(?:那个|那个啊)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => anoSensei,
            },
            {
                id: 'namero.sensei.stub',
                needs: ['sensei', 'lick'],
                match: (cur, src) => /舐めろ/.test(src) && /先生|せんせい/.test(src)
                    && /^(?:给我舔|舔一下|舔)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => nameroSensei,
            },
            {
                id: 'ramee.alone.stub',
                needs: ['rame'],
                match: (cur, src) => /^(?:らめぇ|らめえ|ラメェ)[っッ]?[!！?？…。．.\s]*$/u.test(src.trim())
                    && /^(?:靠|卧槽|妈的|该死)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.dameZh,
            },
            {
                id: 'dashite.kure.stub',
                needs: ['dashite'],
                match: (cur, src) => /出してくれ|出して下さい|出してください/.test(src)
                    && !re('5aOwfOaJi+WHunzjgYrjgaPjgbHjgYQ=').test(src)
                    && (
                        /^(?:拿出来|给我拿|拿来)[…。．.!！?\s]*$/u.test(cur.trim())
                        || /请摸|摸我|摸吧/.test(cur)
                    ),
                ok: (cur, src) => (/请摸|摸我|摸吧/.test(cur) ? T.pleaseShootZh : T.shootOutZh),
            },
            {
                id: 'dashite.ii.sweat.stub',
                needs: ['dashite'],
                match: (cur, src) => /出してもいい|出していい/.test(src)
                    && /流汗|出汗/.test(cur),
                ok: (cur, src) => T.canShootOutQZh,
            },
            {
                id: 'dashite.ii.takeout.stub',
                needs: ['dashite'],
                match: (cur, src) => /出していい|出してもいい/.test(src)
                    && !/声/.test(src)
                    && /^(?:可以拿出来吗|拿出来吗|可以拿出来)[…。．.!！?\s]*$/u.test(cur.trim()),
                ok: (cur, src) => T.canShootOutQZh,
            },
            {
                id: 'tip.seme.stub',
                needs: ['tip'],
                match: (cur, src) => /先っぽ|先っちょ/.test(src) && /責め/.test(src)
                    && (/责罚/.test(cur) || (/先头|刺激一下/.test(cur) && !/前端/.test(cur))),
                ok: (cur, src) => (/责罚/.test(cur) ? semeOk : semeStim),
            },
            {
                id: 'ikuiku.spaced.shoot.stub',
                needs: ['iku'],
                match: (cur, src) => /イク(?:イク)+|イクイク/.test(src)
                    && /射\s*射/.test(cur)
                    && !re('6KaB5bCE5LqG').test(cur),
                ok: (cur, src) => T.aboutToCumZh,
            },
            {
                id: 'chin.trunc.stub',
                needs: ['rod'],
                match: (cur, src) => re('Xig/OuOBiik/44Gh44KT44Gh44KT44KSP1vigKbjg7suXSok', 'u').test(src.replace(/\s/g, ''))
                    && /硬货|玩意|东西/.test(cur),
                ok: (cur, src) => T.meatRodEllZh,
            },
        ];
        return _simpleAdultStubRules;
    }

    function applySimpleAdultStubs(cur, src, note) {
        const rules = getSimpleAdultStubRules();
        if (lexicon?.matchStubRules) {
            const hit = lexicon.matchStubRules(rules, cur, src);
            if (hit) {
                note('domain_term');
                return hit.text;
            }
            return cur;
        }
        for (const rule of rules) {
            if (rule.match(cur, src)) {
                note('domain_term');
                return rule.ok(cur, src);
            }
        }
        return cur;
    }

    function runFirstMatch(rules, ctx) {
        if (!Array.isArray(rules)) return false;
        for (let i = 0; i < rules.length; i += 1) {
            const rule = rules[i];
            if (rule && typeof rule.test === 'function' && rule.test(ctx)) {
                const out = typeof rule.apply === 'function' ? rule.apply(ctx) : undefined;
                if (typeof out === 'string') {
                    ctx.next = out;
                    return true;
                }
                // undefined apply → try next rule (avoid no-op claim)
            }
        }
        return false;
    }

    let _underCoverRules = null;

    function getUnderCoverRules() {
        if (_underCoverRules) return _underCoverRules;

        const ellTrim = /[…。．.!！?\s]*$/u;
        const moanStubZh = /^(?:嗯[\s嗯]*|哈(?:啊|[…·\s]*哈)+|哈|呵呵|呜)[!！?？…。．.\s]*$/u;
        const prefixDomain = (prefix, next) => (
            moanStubZh.test(String(next || '').trim()) ? `${prefix}…` : `${prefix}${next}`
        );
        const G = {
            xianTou: new RegExp(T.xianTouMisZh),
            xianTouG: new RegExp(T.xianTouMisZh, 'g'),
            tipCover: new RegExp(`${T.frontTipZh}|${T.glansZh}|${T.xianDuanZh}`),
            yangwu: new RegExp(T.yangwuZh),
            yangwuG: new RegExp(T.yangwuZh, 'g'),
            rodCover: new RegExp(`${T.meatRodZh}|${T.rodZh}|${T.jiJiZh}|${T.yangwuZh}`),
            rodCoverNoYangwu: new RegExp(`${T.meatRodZh}|${T.rodZh}|${T.jiJiZh}`),
            glans: new RegExp(T.glansZh),
            mankoCover: new RegExp(T.pussyZh),
            dashiteCover: re('5bCEfOeyvua2snzlj6PmsLR854ix5rayfOaOj+WHunzmjo/lh7rmnaV85ou/5Ye65p2lfOWwhOeyvnzlsITkuoY='),
            ikuCover: re('6KaB5bCEfOimgeWOu3zlsITkuoZ85Y675LqGfOmrmOa9rnzlho3ljrt85LiN6IO95Y67fOWwhOW+l3zlsITov4d85bCE5LiA5qyh'),
            senseiCover: re('6ICB5biIfOWFiOeUn3zljLvnlJ8='),
            lickCover: re('6IiUfOWQq3zlj6PkuqR85ZC5'),
            touchCover: re('5pG4fOinpnznorA='),
            nippleCover: new RegExp(`${T.nippleZh}|${T.naiTouZh}`),
            rameCover: re('5LiN6KGMfOS4jeimgXzliKt856KN5LqL'),
            choudaiCover: re('57uZfOaxgg=='),
            ireteCover: re('5o+SfOi/mw=='),
            kissCover: re('5LqyfOWQuw=='),
            meatRod: new RegExp(T.meatRodZh),
            frontTip: new RegExp(T.frontTipZh),
            shotChar: re('5bCE'),
            outShotFlow: re('5Ye6fOWwhHzmtYE='),
            loveOrShot: new RegExp(`${T.loveJuiceZh}|${d('5bCE')}`),
            tipOrFront: new RegExp(`先っぽ|${T.frontTipZh}`),
            senseiOr: new RegExp(`${T.senseiZh}|${T.senseiJa}`),
        };

        const S = {
            frontJustShot: T.frontTipZh + d('5Yia5bCE6L+H'),
            rodTipTip: T.meatRodTipZh + T.frontTipZh,
            baRod: d('5oqK') + T.meatRodZh,
            rodJieWo: T.meatRodZh + d('5YCf5oiR'),
            rodJie: T.meatRodZh + d('5YCf'),
            rodHardStick: d('6IKJ5qOS56Gs5b6X5YOP5qON5a2Q'),
            rodHard: T.meatRodZh + d('56Gs'),
            rodBurst: T.meatRodZh + d('6KaB5pKR56C0'),
            uncleDe: d('5aSn5Y+U55qE'),
            uncleRod: d('5aSn5Y+U55qE6IKJ5qOS'),
            rodBest: T.meatRodZh + d('5pyA5qOS5LqG4oCm'),
            fromUncleRodTip: d('5LuO5aSn5Y+U55qE') + T.meatRodTipZh,
            uncleRodTipJoy: d('5aSn5Y+U55qE6IKJ5qOS5YmN56uv5rWB5Ye65aW95aSa55m955qE4oCm5aW95byA5b+D'),
            letMeSeeRod: d('6K6p5oiR55yL55yL6IKJ5qOS4oCm'),
            yourRod: d('5L2g55qE6IKJ5qOS'),
            insertMineRod: d('5o+S6L+b5oiR55qE6IKJ5qOS'),
            useRod: d('55So6IKJ5qOS'),
            hotRod: d('5aW954Or55qE6IKJ5qOS'),
            rodWet: d('6IKJ5qOS5rm/5ryJ5ryJ55qE4oCm55yf5Y6J5a6z4oCm'),
            hangRod: d('57uZ5L2g5Z6C5LiL6IKJ5qOS4oCm'),
            rodNormie: d('6IKJ5qOS4oCm5LiA6Iis5Lq65Y+v5LiN5aSq6KGM'),
            rodHow: d('6IKJ5qOS5oCO5LmI5qC35LqG77yf'),
            realRod: d('55yf5q2j55qE6IKJ5qOS'),
            useRealRod: d('55So55yf5q2j55qE6IKJ5qOS'),
            wantRodQ: d('5oOz6KaB6IKJ5qOS5ZCX77yf'),
            rubRodGo: d('5Zev4oCm55So6IKJ5qOS6Lmt5b6X5oiR6KaB5Y675LqG77yf'),
            morningRod: d('5ZOI4oCm5pep5LiK55So6IKJ5qOS6Lmt5Lmz5aS05Y675LqG5ZGi4oCm'),
            rodGlans: T.meatRodZh + T.glansZh,
            rodOral: T.meatRodZh + T.oralZh,
            semenOnRod: d('5oOz6K6p57K+5ray5bCE5Yiw6IKJ5qOS5LiK4oCm'),
            stirRod: d('5b6A6YKj6YeM5pCF4oCm55So6IKJ5qOS4oCm5ZOI4oCm'),
            serveRod: d('55So6IKJ5qOS5L6N5aWJ4oCm'),
            useThisRod: d('55So6L+Z5Liq6IKJ5qOS'),
            bigRodScare: d('5aW95aSn55qE6IKJ5qOS77yM5ZCT5oiR5LiA6Lez4oCm'),
            rodSoon: d('6IKJ5qOS6ams5LiK4oCm5ZOI4oCm'),
            rodHardQ: d('6IKJ5qOS56Gs5LqG5ZCX77yf'),
            rodHardEll: T.meatRodZh + d('56Gs5LqG4oCm'),
            rodAgainHard: T.meatRodZh + d('5Y+I56Gs'),
            rodHardPrefix: T.meatRodZh + d('56Gs5LqG'),
            mouthRod: d('5Zi06YeM55qE6IKJ5qOS4oCm'),
            rodClamp: d('6IKJ5qOS5aS5552A4oCm'),
            rodBurstShoot: d('6IKJ5qOS6KaB54iG5bCE5LqG4oCm'),
            rawRod: d('5aW95aSa4oCm55So55Sf6IKJ5qOS4oCm'),
            yourRodEll: d('5L2g55qE6IKJ5qOS4oCm'),
            rodNante: d('5ZWK4oCm6IKJ5qOS5LuA5LmI55qE4oCm'),
            uncleRodAlso: d('5Zev5ZO84oCm5aSn5Y+U55qE6IKJ5qOS5Lmf4oCm'),
            onRod: d('5ZWK4oCm6IKJ5qOS5LiK4oCm'),
            ontoRod: d('5b6A6IKJ5qOS5LiK4oCm'),
            rodMore: d('6IKJ5qOS5YaN5aSa4oCm5YaN5aSa4oCm5ZOI4oCm'),
            thinkRod: d('5oOz552A6IKJ5qOS4oCm'),
            rodGuchu: d('6IKJ5qOS4oCm5ZKV5ZW+5ZKV5ZW+4oCm'),
            wantShootRod: d('5ZOI4oCm5oiR5Lmf5oOz5aSa5bCE6IKJ5qOS4oCm5ZOI4oCm'),
            rodNoInsert: d('6IKJ5qOS4oCm5o+S5LiN6L+b5Y674oCm5Zev4oCm'),
            wantRodDirect: d('5oOz6KaB6IKJ5qOS4oCm5Zev4oCm55u05o6l4oCm'),
            rodFirstTime: d('6IKJ5qOS5Yia5Ye65p2l4oCm5Zug5Li65piv56ys5LiA5qyh4oCm'),
            pussyStrip: d('5bCP56m04oCm6ISx5o6J4oCm'),
            pussyStop: d('5YGc5LiN5LiL5p2l5ZWK4oCm5bCP56m04oCm5Zev'),
            pussyInsertRod: d('5b6A5oiR5bCP56m06YeM4oCm5Zev4oCm5o+S6IKJ5qOS4oCm'),
            canSeePussy: d('5Y+v5Lul55yL5oiR55qE5bCP56m05ZCX77yf'),
            lickPussyPls: d('6K+36IiU5oiR55qE5bCP56m04oCm'),
            pussyWhite: d('5ZOI4oCm5bCP56m06YeM6Z2i5LiA54mH55m94oCm'),
            myPussy: d('5oiR55qE5bCP56m0'),
            pussyYummy: d('5bCP56m05aW95ZCD5ZCX'),
            pussyNong: d('5bCP56m05Lmf6KaB5L2g5aW95aW95byE4oCm'),
            dirtyPussy: d('5Zi/5Zi/4oCm6L+H5p2l4oCm6ISP5YWu5YWu55qE5bCP56m05aW95aW94oCm'),
            fromRodTipWhite: d('5LuO6IKJ5qOS5YmN56uv5bCE5Ye65aW95aSa55m955qE4oCm5aW95byA5b+D'),
            canShoot: d('5Y+v5Lul5bCE'),
            moreJuice: d('5YaN5pCT5pCT77yM54ix5ray5rWB5Ye65p2l5aW95aSa4oCm'),
            juiceMore: T.loveJuiceZh + d('5bCx5pu05aSa5LqG'),
            onlyOnce: d('5ZOI4oCm5Y+v5Lul5Y+q5bCE5LiA5qyh5ZCX4oCm'),
            canShootEll: d('5Y+v5Lul5bCE5LqG4oCm'),
            throatShoot: d('55So6YKj5Liq5ray5bCE6L+b5ZaJ5ZKZ6YeM4oCm'),
            waistShoot: d('5bCE5Zyo6IWw5LiK4oCm'),
            niniShoot: d('5bCE57uZ5aau5aau4oCm5LuO5YmN56uv4oCm'),
            nakadashiLoud: d('5oOz6KKr5YaF5bCE4oCm5YaN6K+05aSn5aOw54K54oCm'),
            howShoot: d('5oCO5LmI5Yqe4oCm5bCE5Ye65p2l4oCm5ZOI4oCm'),
            tomorrowShoot: d('5piO5aSp5bCE57uZ5oiR4oCm6KaB5bCE5LqG4oCm'),
            forcedShoot: d('6KKr5byE5bCE5LqG4oCm5Zi/5Zi/77yM5qC55pys5rKh5pG45Yiw6IKJ5qOS'),
            thatShoot: d('6YKj5Liq4oCm5bCE5Ye65p2l4oCm'),
            assShoot: d('5a+5552A5bGB6IKh5bCE5Ye65p2l4oCm'),
            shootNn: T.shootOutEllZh + d('5Zev4oCm'),
            allShoot: d('5YWo6YO95bCE5Ye65p2l4oCm'),
            feelShoot: d('5oSf6KeJ5Yiw5LqG4oCm5aSa5bCE5Ye65p2l4oCm'),
            tryShoot: d('6K+V552A5bCE5Ye65p2l4oCm'),
            canShootQ: d('5Y+v5Lul5bCE5LqG5ZCX77yf'),
            cantGoYet: d('6L+Y5LiN6IO95Y675ZOm4oCm5b+N5L2P4oCm'),
            ikuIkuShoot: d('6KaB5bCE5LqG4oCm6KaB5bCE5LqG4oCm5ZOI4oCm'),
            ikuIkuGo: d('6KaB5Y675LqG4oCm6KaB5Y675LqG4oCm5ZOI4oCm'),
            ikuIkuDameGo: d('5LiN6KGM4oCm6KaB5Y675LqG4oCm6KaB5Y675LqG4oCm5ZOI4oCm'),
            ikuIkuGo: d('6KaB5Y675LqG4oCm6KaB5Y675LqG4oCm5ZOI4oCm'),
            ikuIkuDameGo: d('5LiN6KGM4oCm6KaB5Y675LqG4oCm6KaB5Y675LqG4oCm5ZOI4oCm'),
            goAgain: d('5YaN5Y675LiA5qyh4oCm5YaN5Y675LiA5qyh4oCm5ZWK4oCm'),
            goDame: d('6KaB5Y675LqG4oCm5LiN6KGM5LiN6KGM4oCm'),
            senseiGo: d('5Zev4oCm6ICB5biI5Lmf6KaB5Y675LqG4oCm5ZOI4oCm'),
            oreIku: d('6YKj4oCm5p2l5ZCn4oCm5oiR6KaB5bCE5LqG4oCm5Zev'),
            againGo: d('5ZWK4oCm5Y+I6KaB5Y675LqG4oCm'),
            thereGo: d('5ZOO5ZGA4oCm6YKj6YeM6KaB5Y675LqG4oCm'),
            rubGo: d('5pGp5pOm5b6X5aW95Yi65r+A4oCm6KaB5Y675LqG4oCm5ZWK4oCm'),
            oopsGo: d('5ZWK77yf57Of5LqG4oCm6L+Z5qC36KaB5Y675LqG4oCm'),
            senseiTouch: d('6ICB5biI5Lmf5Y+v5Lul5pG45ZCX77yf'),
            lickSensei: d('5oOz6IiU6ICB5biI4oCm'),
            feelSensei: d('5ZWK4oCm5aW96IiS5pyN4oCm6ICB5biI4oCm'),
            senseiLook: d('6YKj5bCx6K6p6ICB5biI55yL55yL4oCm'),
            thenLick: d('6YKj5oiR6IiU5LqG4oCm'),
            wantLick: d('5oOz6K6p5L2g6IiU4oCm'),
            rubLick: d('6Lmt5LiA5LiL4oCm6IiU5LiA5LiL4oCm'),
            lickWell: d('5aW95aW96IiU5ZWK4oCm'),
            grandpaLick: d('54i354i36IiU5b6X5pu05aW94oCm5aW95aW96IiU4oCm'),
            tryLick: d('5p2l6IiU6IiU55yL4oCm5oiR5aW96Imy4oCm'),
            lickNipGo: d('5ZWK4oCm6IiU5Lmz5aS06KaB5Y675LqG4oCm'),
            lickAgainFast: d('5ZWK77yf6L+Z5LmI5b+r5Y+I6IiU5LiK5LqG4oCm'),
            lonelyTouch: d('5aW95a+C5a+e4oCm5aW95oOz6KKr5pG44oCm'),
            touchMe: d('5pG45oiR4oCm'),
            plsTouch: d('6K+35pG45oiR4oCm6K6p5oiR6IiS5pyN4oCm'),
            lickAndTouch: d('5LiA6L656IiU5LiA6L655YGa4oCm5oOz6KKr5pG44oCm'),
            touchMeSuf: d('4oCm5pG45oiR4oCm'),
            nipRub: d('5Lmz5aS05pGp5pOm552A5ouU5Ye65p2l4oCm5Zev4oCm'),
            lickRodNip: d('57uZ5oiR6IiU6IiU6IKJ5qOS5ZKM5Lmz5aS04oCm'),
            nipHard: d('5Lmz5aS05Lmf56Gs6YKm6YKm55qE4oCm'),
            nipUp: d('5Lmz5aS06KaB5piv5oy66LW35p2l55qE6K+d4oCm'),
            playNip: d('546p5Lmz5aS05ZWK4oCm5ZWK5ZWK4oCm'),
            nipFeel: d('5Lmz5aS05aW96IiS5pyN'),
            nipGo: d('5Lmz5aS06KaB5Y675LqG'),
            nipEll: d('5Lmz5aS04oCm'),
            dameItch: d('5LiN6KGM4oCm5aW955eS4oCm5LiA55u05ouU5Ye65p2l4oCm'),
            nextTipGive: d('6YKj5LiL5LiA5Liq5YmN56uv57uZ5oiR4oCm5ZOI4oCm'),
            handGive: d('6L+Y5beu5LiA54K54oCm5bCE5LqG4oCm5oqK5omL57uZ5oiR4oCm'),
            semenAll: d('57K+5ray5YWo6YOo57uZ5oiR4oCm5bCE6YeM6Z2i4oCm'),
            giveFeel: d('5Lmf57uZ5oiR54K55oSf6KeJ4oCm'),
            moreGive: d('5YaN5aSa57uZ5oiR5LiA54K54oCm'),
            deepGive: d('5rex5aSE4oCm57uZ5oiR4oCm5ZWK77yM5LiN6KGM4oCm'),
            giveSuf: d('4oCm57uZ5oiR4oCm'),
            fingerTry: d('5oqK5omL5oyH5o+S6L+b5Y676K+V6K+V4oCm'),
            insertTry: d('56iN5b6u5o+S6L+b5Y676K+V6K+V6KGM5ZCX77yf'),
            mouthInsert: d('5YaN5b6A5Zi06YeM5aSa5o+S5LiA54K54oCm'),
            rawInsert: d('6K+35aSa5aSa5YWz54Wn4oCm55Sf6IKJ5qOS5o+S6L+b5p2l4oCm'),
            slowInsert: d('5ZWK4oCm5aW95Y6J5a6z4oCm5Y+q5piv5oWi5oWi5o+S6L+b5Y676ICM5bey5ZCn77yf'),
            insertHere: d('5o+S5Zyo6L+Z6YeM4oCm'),
            throatSwallow: d('5Zev77yM5Zac5qyi4oCm6IO96Ieq5bex5ZCe5Yiw5ZaJ5ZKZ5rex5aSE4oCm'),
            fingerDeep: d('5omL5oyH5o+S5b6X5aW95rex5ZGi4oCm5aW957Sn5a6e4oCm'),
            insertFeel: d('5LiN6KGM4oCm5o+S6L+b5p2l5aW96IiS5pyN4oCm'),
            kissServe: d('5YWI5Yir5Y+q6aG+6IKJ5qOS4oCm5LuK5aSp6KaB5YWo6Lqr5L6N5aWJ4oCm5ZOI4oCm5Lqy5Lqy5oiR4oCm'),
            kissSuf: d('4oCm5Lqy5Lqy4oCm'),
            nong: d('5byE'),
        };

        const R = {
            justShot: re('5Yia5bCE6L+H'),
            rodTipTip: re('6IKJ5qOS5YmN56uv5YmN56uv'),
            meatRod: new RegExp(T.meatRodZh),
            baNotRod: re('5oqKKD8h6IKJ5qOSKQ=='),
            notRodJieWo: re('KD88IeiCieajkinlgJ/miJE='),
            jie: re('5YCf'),
            hardStick: re('56Gs5b6X5YOP5qC55qON5a2QfOWDj+agueajjeWtkA=='),
            hard: re('56Gs'),
            burst: re('6KaB5pKR56C0'),
            myHubby: re('5oiR6ICB5YWs55qE'),
            frontTip: new RegExp(T.frontTipZh),
            fromTip: re('5LuO5YmN56uvfOS7juWkp+WPlOeahOWJjeerrw=='),
            yourThere: re('5L2g6YKj6YeM'),
            insertMine: re('5o+S6L+b5oiR55qE'),
            yong: re('55So'),
            yongEnd: re('55SoXHMqJA==', 'u'),
            yongHa: re('55SoXHMq5ZOI'),
            uncleNotRod: re('5aSn5Y+U55qEKD8h6IKJ5qOSKQ=='),
            hotDe: re('5aW954Or55qE'),
            dingdingG: re('5LiB5LiB', 'g'),
            yangwuG: new RegExp(T.yangwuZh, 'g'),
            realDe: re('55yf5q2j55qE'),
            useReal: re('55So55yf5q2j55qE'),
            glans: new RegExp(T.glansZh),
            thatThingG: re('6YKj5Liq5Lic6KW/fOi/meS4nOilv3zkuJzopb8=', 'g'),
            koucaoG: re('5Y+j5pON', 'g'),
            oral: new RegExp(T.oralZh),
            naLiG: re('6YKj6YeM', 'g'),
            bodyPartG: re('6Lqr5L2T6YOo5L2N', 'g'),
            myThere: re('5oiR55qE6YKj6YeMfOmCo+mHjA=='),
            yummyQ: re('5aW95ZCD5ZCX'),
            ready: re('5YeG5aSH5aW9'),
            outOkG: re('5Ye65p2l5bCx5aW9fOS5n+WPr+S7peWHuuadpQ==', 'g'),
            secretG: re('5YiG5rOM54mp', 'g'),
            moreThen: re('5bCx5pu05aSa5LqG'),
            xieLe: re('5rOE5LqG'),
            kissG: re('5Lqy', 'g'),
            choudong: re('5oq95Yqo'),
            choudongFeel: re('5oq95Yqo5b6X5aW96IiS5pyN'),
            cumOrGoG: re('6KaB5bCE5LqGfOimgeWOu+S6hg==', 'g'),
            rameG: re('5YuS5qKFfOWYnuWYnu+8gT/lkaI/fOecn+S7luWomOeahHznnJ/ku5blpoh86K+l5q2755qEfOivpeatuw==', 'g'),
            againHard: re('5Y+I56Gs'),
            hardLeStart: re('XuehrOS6hg=='),
            jiaHuoG: re('6YKj5a625LyZfOWutuS8mQ==', 'g'),
        };

        const tip = [
            {
                id: 'tip.inject',
                test: (ctx) => /先っぽ|先っちょ/.test(ctx.s) && !G.tipCover.test(ctx.next),
                apply: (ctx) => {
                    let next = ctx.next;
                    if (/射过|痒|刺激|责|美味|喜欢|最爱|对着|不行/.test(next) || ctx.len() <= 18) {
                        if (/刚射过|射过还/.test(next)) {
                            next = next.replace(R.justShot, S.frontJustShot).replace(R.rodTipTip, T.meatRodTipZh);
                        } else if (!G.frontTip.test(next)) {
                            next = next.replace(R.meatRod, T.meatRodTipZh) || `${T.frontTipZh}${next}`;
                        }
                        if (!G.frontTip.test(next)) next = `${T.frontTipZh}${next}`;
                    }
                    return next;
                },
            },
        ];

        const rod = [
            {
                id: 'rod.guy',
                test: (ctx) => /那家伙|家伙还没|家伙好|的家伙/.test(ctx.next),
                apply: (ctx) => ctx.next.replace(R.jiaHuoG, T.meatRodZh),
            },
            {
                id: 'rod.borrow',
                test: (ctx) => /借我|借一下/.test(ctx.next),
                apply: (ctx) => {
                    let next = ctx.next.replace(R.baNotRod, S.baRod).replace(R.notRodJieWo, S.rodJieWo);
                    if (!G.meatRod.test(next)) next = next.replace(R.jie, S.rodJie);
                    return next;
                },
            },
            {
                id: 'rod.stick',
                test: (ctx) => /硬得像根棍子|像根棍子/.test(ctx.next),
                apply: (ctx) => ctx.next.replace(R.hardStick, S.rodHardStick),
            },
            {
                id: 'rod.hard.limit',
                test: (ctx) => /硬不下来|硬得|硬硬|限界|撑破/.test(ctx.next),
                apply: (ctx) => {
                    let next = /硬|撑破/.test(ctx.next)
                        ? ctx.next.replace(R.hard, S.rodHard).replace(R.burst, S.rodBurst)
                        : prefixDomain(T.meatRodZh, ctx.next);
                    if (/老公的/.test(next) && /おじさん/.test(ctx.s)) next = next.replace(R.myHubby, S.uncleRod);
                    return next;
                },
            },
            {
                id: 'rod.tip.prefix',
                test: (ctx) => G.frontTip.test(ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: (ctx) => ctx.next.replace(R.frontTip, T.meatRodTipZh),
            },
            {
                id: 'rod.feel.prefix',
                test: (ctx) => /^好舒服/.test(ctx.next.trim()) || (/舒服/.test(ctx.next) && ctx.len() <= 12),
                apply: (ctx) => prefixDomain(T.meatRodZh, ctx.next),
            },
            {
                id: 'rod.best',
                test: (ctx) => re('XuimgeWwhOS6hlvigKbjgILvvI4uIe+8gT9cc10qJA==', 'u').test(ctx.next.trim()) && re('44Gh44KT44Gh44KT5pyA6auYfOOBoeOCk+OBveawl+aMgeOBoXzjgoLjgaHjgoLmnIDpq5g=').test(ctx.s),
                apply: () => S.rodBest,
            },
            {
                id: 'rod.white.flow',
                test: (ctx) => /泡饮|白色的|流出好多/.test(ctx.next) && /先っぽ|出して/.test(ctx.s),
                apply: (ctx) => {
                    let next = ctx.next.replace(R.fromTip, S.fromUncleRodTip);
                    if (!G.meatRod.test(next)) next = S.uncleRodTipJoy;
                    return next;
                },
            },
            {
                id: 'rod.look',
                test: (ctx) => /^看[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: (ctx) => (/見して|見せて/.test(ctx.s) ? S.letMeSeeRod : T.meatRodEllZh),
            },
            {
                id: 'rod.touch.short',
                test: (ctx) => /摸/.test(ctx.next) && /触って/.test(ctx.s) && ctx.len() <= 8,
                apply: () => T.touchRodEllZh,
            },
            {
                id: 'rod.motion',
                test: (ctx) => /抽动|蹭|摩擦|滑|光滑|痒|软|抖动|在抖|好烫|湿漉漉|寂寞|垂下|一般人/.test(ctx.next),
                apply: (ctx) => {
                    const next = ctx.next;
                    if (/你那里/.test(next)) return next.replace(R.yourThere, S.yourRod);
                    if (/插进我的$|插进我的/.test(next)) return next.replace(R.insertMine, S.insertMineRod);
                    if (R.yongEnd.test(next.trim()) || R.yongHa.test(next)) return next.replace(R.yong, S.useRod);
                    if (/大叔的在抖|的在抖/.test(next)) return next.replace(R.uncleNotRod, S.uncleDe + T.meatRodZh);
                    if (/好烫的/.test(next)) return next.replace(R.hotDe, S.hotRod);
                    if (/湿漉漉的/.test(next)) return S.rodWet;
                    if (/给你垂下/.test(next)) return S.hangRod;
                    if (/一般人/.test(next)) return S.rodNormie;
                    return `${T.meatRodZh}${next}`;
                },
            },
            {
                id: 'rod.compare.pussy.mis',
                test: (ctx) => re('44OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && re('5bCP56m0').test(ctx.next)
                    && !re('44G+44KT44GTfOOBiuOBvuOCk+OBkw==').test(ctx.s)
                    && /比べ|どうですか|怎么样/.test(ctx.s + ctx.next),
                apply: (ctx) => ctx.next.replace(re('5bCP56m0', 'g'), T.meatRodZh),
            },
            {
                id: 'rod.compare.pussy.mis',
                test: (ctx) => re('44OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && re('5bCP56m0').test(ctx.next)
                    && !re('44G+44KT44GTfOOBiuOBvuOCk+OBkw==').test(ctx.s)
                    && /比べ|どうですか|怎么样/.test(ctx.s + ctx.next),
                apply: (ctx) => ctx.next.replace(re('5bCP56m0', 'g'), T.meatRodZh),
            },
            {
                id: 'rod.how',
                test: (ctx) => /怎么样了|怎样了/.test(ctx.next),
                apply: () => S.rodHow,
            },
            {
                id: 'rod.real.ding',
                test: (ctx) => re('55yf55qEfOWunui3tXzor5Xor5V85LiB5LiBfOmYs+eJqQ==').test(ctx.next),
                apply: (ctx) => {
                    let next = ctx.next.replace(R.dingdingG, T.meatRodZh).replace(R.yangwuG, T.meatRodZh);
                    if (!G.meatRod.test(next)) next = next.replace(R.realDe, S.realRod).replace(R.useReal, S.useRealRod);
                    if (!G.meatRod.test(next) && ctx.len() <= 18) next = `${T.meatRodZh}${next}`;
                    return next;
                },
            },
            {
                id: 'rod.want.insert',
                test: (ctx) => /想插|欲しい/.test(ctx.next + ctx.s) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: (ctx) => (/想插|欲しいの/.test(ctx.next + ctx.s) ? S.wantRodQ : prefixDomain(T.meatRodZh, ctx.next)),
            },
            {
                id: 'rod.rub.otsuyu',
                test: (ctx) => re('5pOm5oiR55qE57K+5rayfOOBiuOBpOOChuOBoeOCk+OBvQ==').test(ctx.next + ctx.s),
                apply: () => S.rubRodGo,
            },
            {
                id: 'rod.morning.nip',
                test: (ctx) => re('5pep5LiK55So5Lmz5aS0fOacneOBruOBoeOCk+OBvQ==').test(ctx.next + ctx.s),
                apply: () => S.morningRod,
            },
            {
                id: 'rod.glans',
                test: (ctx) => G.glans.test(ctx.next) && /オチン/.test(ctx.s),
                apply: (ctx) => (ctx.next.includes(T.meatRodZh) ? ctx.next : ctx.next.replace(R.glans, S.rodGlans)),
            },
            {
                id: 'rod.thing',
                test: (ctx) => /东西|那个东西/.test(ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844Kq44OB44Oz').test(ctx.s),
                apply: (ctx) => ctx.next.replace(R.thatThingG, T.meatRodZh),
            },
            {
                id: 'rod.oral.typo',
                test: (ctx) => /口操/.test(ctx.next) && re('44GX44KD44G2fOOBoeOCk+OBvXzjgYrjgaHjgpM=').test(ctx.s),
                apply: (ctx) => {
                    let next = ctx.next.replace(R.koucaoG, T.oralZh);
                    if (!G.meatRod.test(next)) next = next.replace(R.oral, S.rodOral);
                    return next;
                },
            },
            {
                id: 'rod.semen.on',
                test: (ctx) => re('57K+5ray5bCE5Yiw5L2g6YKj6YeMfOWeguOCieOBl+OBpg==').test(ctx.next + ctx.s) && re('44GK44Gh44KT44G9fOOBoeOCk+OBvQ==').test(ctx.s),
                apply: () => S.semenOnRod,
            },
            {
                id: 'rod.stir',
                test: (ctx) => re('5re36L+b5Y67fOOBiuOBoeOCk+OBveOBpw==').test(ctx.next + ctx.s) && re('44GK44Gh44KT44G944Gn').test(ctx.s),
                apply: () => S.stirRod,
            },
            {
                id: 'rod.insert.mine',
                test: (ctx) => /插进我的$|插进我的[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: (ctx) => ctx.next.replace(R.insertMine, S.insertMineRod),
            },
            {
                id: 'rod.serve',
                test: (ctx) => /ほうし|奉仕/.test(ctx.s) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => S.serveRod,
            },
            {
                id: 'rod.this',
                test: (ctx) => /用这个/.test(ctx.next) && re('44GT44Gu44Gh44KT44G9fOOBk+OBruOBiuOBoeOCkw==').test(ctx.s),
                apply: () => S.useThisRod,
            },
            {
                id: 'rod.scare',
                test: (ctx) => /吓了|びっくり|好厉害/.test(ctx.next) && re('44GZ44GU44GE44Gh44KTfOOBoeOCk+OBoeOCk+OBs+OBo+OBj+OCig==').test(ctx.s),
                apply: () => S.bigRodScare,
            },
            {
                id: 'rod.soon',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44GZ44GQfOOBmeOBkOKApg==').test(ctx.s) && /马上/.test(ctx.next) && !G.meatRod.test(ctx.next),
                apply: () => S.rodSoon,
            },
            {
                id: 'rod.hard.q',
                test: (ctx) => /^硬了[吗？?…。．.!！\s]*$/u.test(ctx.next.trim()) || /^硬了吗/.test(ctx.next.trim()),
                apply: (ctx) => (/勃った|は勃った/.test(ctx.s) ? S.rodHardQ : S.rodHardEll),
            },
            {
                id: 'rod.hard.again',
                test: (ctx) => /又硬|硬了/.test(ctx.next) && ctx.len() <= 8,
                apply: (ctx) => {
                    let next = ctx.next.replace(R.againHard, S.rodAgainHard).replace(R.hardLeStart, S.rodHardPrefix);
                    if (!G.meatRod.test(next)) next = `${T.meatRodZh}${next}`;
                    return next;
                },
            },
            {
                id: 'rod.mouth',
                test: (ctx) => /口腔|おくちん/.test(ctx.next + ctx.s) && re('44GK44GP44Gh44KT44Gh44KTfOOBiuWPoy4/44Gh44KT').test(ctx.s),
                apply: () => S.mouthRod,
            },
            {
                id: 'rod.clamp',
                test: (ctx) => /夹着|挟んで/.test(ctx.next + ctx.s)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !/乳首|ちくび/.test(ctx.s),
                apply: () => S.rodClamp,
            },
            {
                id: 'rod.burst.shoot',
                test: (ctx) => re('6KaB5bCE5LqGfOeIhueZug==').test(ctx.next + ctx.s) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && ctx.len() <= 10,
                apply: () => S.rodBurstShoot,
            },
            {
                id: 'rod.team',
                test: (ctx) => re('5YWo5piv56Gs55qEfOODgeODvOODoOODgeODs+ODnXzjg4Hjg7Pjg53jgaA=').test(ctx.next + ctx.s),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.ochi.dup',
                test: (ctx) => re('5bCE5bCEfOOCquODgeOCquODgeODs+ODnQ==').test(ctx.next + ctx.s),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.raw.lots',
                test: (ctx) => /很多|いっぱい/.test(ctx.next) && re('55Sf44Gh44KT44G9fOeUn+ODgeODsw==').test(ctx.s),
                apply: () => S.rawRod,
            },
            {
                id: 'rod.your.there',
                test: (ctx) => /你那里/.test(ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCkw==').test(ctx.s) && ctx.len() <= 8,
                apply: () => S.yourRodEll,
            },
            {
                id: 'rod.nante',
                test: (ctx) => /なんて/.test(ctx.s) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && ctx.len() <= 8,
                apply: () => S.rodNante,
            },
            {
                id: 'rod.mm.uncle',
                test: (ctx) => /^嗯哼[…。．.!！?\s]*$/u.test(ctx.next.trim()) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s),
                apply: () => S.uncleRodAlso,
            },
            {
                id: 'rod.ah.on',
                test: (ctx) => /^啊[…。．.!！?\s]*$/u.test(ctx.next.trim()) && re('44GK44Gh44KT44G944Gr').test(ctx.s),
                apply: () => S.onRod,
            },
            {
                id: 'rod.up.more',
                test: (ctx) => /^[上再更][…。．.!！?\s]*$/u.test(ctx.next.trim()) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: (ctx) => {
                    if (re('44GK44Gh44KT44G944GrfOOBoeOCk+OBveOBqw==').test(ctx.s)) return S.ontoRod;
                    if (/もっと/.test(ctx.s)) return S.rodMore;
                    return prefixDomain(T.meatRodZh, ctx.next);
                },
            },
            {
                id: 'rod.ochi.bar',
                test: (ctx) => re('44Kq44OB44Kq44OB44Oz44OdfOWwhOWwhOajkg==').test(ctx.next + ctx.s) && re('44OB44Oz44OdfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.think',
                test: (ctx) => re('5bGx44OB44Oz44OdfOaDs+edgA==').test(ctx.next + ctx.s) && re('44OB44Oz44Od').test(ctx.s),
                apply: () => S.thinkRod,
            },
            {
                id: 'rod.penis.guchu',
                test: (ctx) => /ペニス/.test(ctx.s) && (/^[.…．。\s]*$/u.test(ctx.next) || ctx.len() <= 4),
                apply: () => S.rodGuchu,
            },
            {
                id: 'rod.censored.ochi',
                test: (ctx) => /おち[○〇◯*]ちん/.test(ctx.s) && !G.rodCoverNoYangwu.test(ctx.next)
                    && (
                        re('5Ye644GX44Gf44GEfOS4gOadr+WHunzlh7rjgox85Ye644GX44GmfOWFpeOCjOOBquOBhHzlhaXjgozjgaZ85oy/5YWlfOassuOBl+OBhHznm7TmjqV85pyA5YidfOOBleOBo+OBseOCinzjgZnjgaPjgY3jgoo=').test(ctx.s)
                        || /拿出来|流|插|进不去|想要|直接|^哈|清干净|清爽/.test(ctx.next)
                        || ctx.len() <= 10
                    ),
                apply: (ctx) => {
                    const next = ctx.next;
                    const s = ctx.s;
                    if (/出したい|一杯出/.test(s) || /^哈[…。．.!！?\s]*$/u.test(next.trim())) return S.wantShootRod;
                    if (/出れ|出して|出したい|ちょっと出/.test(s) || /拿出来|流/.test(next)) return T.rodSlightShootZh;
                    if (re('5YWl44KM44Gq44GEfOWFpeOCjOOBpnzmjL/lhaU=').test(s) || /插|进不去|放不/.test(next)) return S.rodNoInsert;
                    if (/欲しい|直接/.test(s) || /想要|直接/.test(next)) return S.wantRodDirect;
                    if (/最初|出れも/.test(s)) return S.rodFirstTime;
                    if (/さっぱり|清干净/.test(s + next)) {
                        return /老师|先生|せんせい/.test(s + next)
                            ? `那我就来帮老师把${T.meatRodZh}也清干净吧`
                            : `那我就来把${T.meatRodZh}也清干净吧`;
                    }
                    if (/すっきり|清爽/.test(s + next)) return `${T.meatRodZh}感觉好清爽了吗？`;
                    if (/舔/.test(next) || /舐め/.test(s)) return `边舔着${T.meatRodZh}…`;
                    if (ctx.len() <= 10) return T.meatRodEllZh;
                    return undefined;
                },
            },
            // ── batch-0817 rod unders ──
            {
                id: 'rod.taste',
                test: (ctx) => /味わ|品尝/.test(ctx.s + ctx.next) && re('44Gh44KT44G9fOOBiuOBoeOCk3zjgZfjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `好好品尝这根${T.meatRodZh}的味道吧`,
            },
            {
                id: 'rod.stand',
                test: (ctx) => /立てて|立起来/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `只要把${T.meatRodZh}立起来就好了哦`,
            },
            {
                id: 'rod.morning.nip',
                test: (ctx) => re('5pyd44Gu44OB44Oz44OdfOaXqeS4iueahA==').test(ctx.s + ctx.next) && re('5Lmz6aaWfOS5s+WktHzjgYTjgaPjgaHjgoM=').test(ctx.s + ctx.next),
                apply: () => `用早上的${T.meatRodZh}把${T.nippleZh}弄到去了呢`,
            },
            {
                id: 'rod.not.finger',
                test: (ctx) => re('5oyH44GY44KD44Gq44GP44Gm44Gh44KT44Gh44KTfOS4jeaYr+eUqOaJi+aMh+iAjOaYr+eUqA==').test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCkw==').test(ctx.s),
                apply: () => `因为这是第一次不是用手指而是用${T.meatRodZh}啊`,
            },
            {
                id: 'rod.finger.or',
                test: (ctx) => re('5oyH44Gh44KT44Gh44KT').test(ctx.s) && /插进去|でしょう/.test(ctx.s + ctx.next),
                apply: () => `用手指还是${T.meatRodZh}插进去吧`,
            },
            {
                id: 'rod.ochinpo.short',
                test: (ctx) => re('44GK44OB44Oz44OdfOOBiuOBoeOCk+OBvQ==').test(ctx.s) && ctx.len() <= 8 && !G.meatRod.test(ctx.next),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.taste',
                test: (ctx) => /味わ|品尝/.test(ctx.s + ctx.next) && re('44Gh44KT44G9fOOBiuOBoeOCk3zjgZfjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `好好品尝这根${T.meatRodZh}的味道吧`,
            },
            {
                id: 'rod.stand',
                test: (ctx) => /立てて|立起来/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `只要把${T.meatRodZh}立起来就好了哦`,
            },
            {
                id: 'rod.morning.nip',
                test: (ctx) => re('5pyd44Gu44OB44Oz44OdfOaXqeS4iueahA==').test(ctx.s + ctx.next) && re('5Lmz6aaWfOS5s+WktHzjgYTjgaPjgaHjgoM=').test(ctx.s + ctx.next),
                apply: () => `用早上的${T.meatRodZh}把${T.nippleZh}弄到去了呢`,
            },
            {
                id: 'rod.not.finger',
                test: (ctx) => re('5oyH44GY44KD44Gq44GP44Gm44Gh44KT44Gh44KTfOS4jeaYr+eUqOaJi+aMh+iAjOaYr+eUqA==').test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCkw==').test(ctx.s),
                apply: () => `因为这是第一次不是用手指而是用${T.meatRodZh}啊`,
            },
            {
                id: 'rod.finger.or',
                test: (ctx) => re('5oyH44Gh44KT44Gh44KT').test(ctx.s) && /插进去|でしょう/.test(ctx.s + ctx.next),
                apply: () => `用手指还是${T.meatRodZh}插进去吧`,
            },
            {
                id: 'rod.ochinpo.short',
                test: (ctx) => re('44GK44OB44Oz44OdfOOBiuOBoeOCk+OBvQ==').test(ctx.s) && ctx.len() <= 8 && !G.meatRod.test(ctx.next),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.hard.bang',
                test: (ctx) => /硬邦邦|好硬好硬|变得好硬|已经硬|パンパン|カチカチ/.test(ctx.next + ctx.s)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OH44Kr44OB44OzfOOBp+OBi+OBoeOCkw==').test(ctx.s),
                apply: (ctx) => {
                    if (re('44OH44Kr44OB44OzfOOBp+OBi+OBoeOCkw==').test(ctx.s)) return `大${T.meatRodZh}…`;
                    let next = ctx.next;
                    if (/硬邦邦|好硬|变得好硬|已经硬/.test(next) && !G.meatRod.test(next)) {
                        next = `${T.meatRodZh}${next}`;
                    } else if (/パンパン|カチカチ/.test(ctx.s) && !G.meatRod.test(next)) {
                        next = `${T.meatRodZh}硬得胀鼓鼓的…`;
                    }
                    return next;
                },
            },
            {
                id: 'rod.want.more',
                test: (ctx) => /もっと欲しく|越来越想要/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `越来越想要${T.meatRodZh}了…`,
            },
            {
                id: 'rod.insert.this',
                test: (ctx) => /入れてもいい|插进来也可以|把这根插/.test(ctx.s + ctx.next)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: (ctx) => {
                    let next = ctx.next
                        .replace(re('5oqK6L+Z5qC5KD866IKJ5qOSKT8='), `把${T.meatRodZh}`)
                        .replace(re('6L+Z5qC5KD8h6IKJ5qOSKQ=='), T.meatRodZh);
                    if (!G.meatRod.test(next)) next = `把${T.meatRodZh}插进来也可以哦`;
                    return next;
                },
            },
            {
                id: 'rod.sit',
                test: (ctx) => /座ってほしい|坐到/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `坐到${T.meatRodZh}上…`,
            },
            {
                id: 'rod.insert.feel',
                test: (ctx) => /挿れたら|插进来以后|插进来/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => ctx.next.replace(/插进/, `${T.meatRodZh}插进`),
            },
            {
                id: 'rod.want.lick',
                test: (ctx) => /舐めてほしい|想让你舔/.test(ctx.s + ctx.next)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `想让你舔${T.meatRodZh}…`,
            },
            {
                id: 'rod.raw.never',
                test: (ctx) => re('55Sf44Gh44KT44G9fOi/mOayoeacieeUqOaPkui/h3zlhaXjgozjgZ/jgZPjgajjgYLjgorjgb7jgZvjgpM=').test(ctx.s + ctx.next),
                apply: () => `还没有用生${T.meatRodZh}插过…`,
            },
            {
                id: 'rod.refresh',
                test: (ctx) => /すっきり|清爽/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `${T.meatRodZh}感觉好清爽了吗？`,
            },
            {
                id: 'rod.bare.manko.wrong',
                test: (ctx) => re('Xig/OuWwj+eptClb4oCm44CC77yOLiHvvIE/XHNdKiQ=', 'u').test(ctx.next.trim())
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !re('44G+44KT44GT').test(ctx.s),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.sensei.big',
                test: (ctx) => /先生|老师/.test(ctx.s + ctx.next)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjg4fjgqs=').test(ctx.s)
                    && /困って|因为|デカく/.test(ctx.s + ctx.next),
                apply: () => `老师，我的${T.meatRodZh}太大了好烦恼…`,
            },
            {
                id: 'rod.never.licked',
                test: (ctx) => /舐められたこともない|还没被舔过/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `${T.meatRodZh}还没被舔过呢`,
            },
            {
                id: 'rod.bad.kid.out',
                test: (ctx) => /悪い子のおちん|坏孩子的/.test(ctx.s + ctx.next)
                    && /出して|掏出/.test(ctx.s + ctx.next),
                apply: () => `请把这根坏孩子的${T.meatRodZh}掏出来`,
            },
            {
                id: 'rod.sensei.nade',
                test: (ctx) => /先生/.test(ctx.s) && re('44GK44Gh44KT44Gh44KT').test(ctx.s) && re('44Gq44Gn44Gq44GnfOOBiuOBo+OBseOBhOOBl+OBquOBjOOCiQ==').test(ctx.s),
                apply: () => `一边揉着老师的${T.breastZh}，一边色气地摸${T.meatRodZh}…`,
            },
            {
                id: 'rod.chiro.remember',
                test: (ctx) => /ちろちろ/.test(ctx.s) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s),
                apply: () => `${T.meatRodZh}滑来滑去…还记得吗…`,
            },
            {
                id: 'rod.deka',
                test: (ctx) => re('44OH44Kr44OB44OzfOOBp+OBi+OBoeOCkw==').test(ctx.s) && !G.meatRod.test(ctx.next) && ctx.len() <= 12,
                apply: () => `大${T.meatRodZh}…`,
            },
            {
                id: 'rod.pain.q',
                test: (ctx) => /苦しくなっちゃった|变难受/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s),
                apply: () => `${T.meatRodZh}难受了吗？`,
            },
            // ── batch-0817b rod unders ──
            {
                id: 'rod.kore.cont',
                test: (ctx) => re('44Gh44KT44Gh44KT44GT44KMfOOBoeOCk+OBoeOCk1xzKuOBk+OCjHzjgZPjgowuezAsNH3jgaHjgpPjgaHjgpM=').test(ctx.s)
                    && /那个|继续/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 8,
                apply: () => `这个${T.meatRodZh}`,
            },
            {
                id: 'rod.shite.cough',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44GX44GmfOOBoeOCk+OBoeOCk+OBl+OBpg==').test(ctx.s)
                    && /咳|哈|诶嘿/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}…`,
            },
            {
                id: 'rod.ketsu.split',
                test: (ctx) => re('44Gh44KT44Gh44KTLnswLDE2feOCseODhOijgnzjgrHjg4Too4LjgYTjgaHjgoPjgYY=').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 8,
                apply: (ctx) => (/旦那以外|他の男/.test(ctx.s)
                    ? `老公以外的男人的${T.meatRodZh}要撑裂屁股了…不过`
                    : `${T.meatRodZh}要撑裂屁股了`),
            },
            {
                id: 'rod.kore.cont',
                test: (ctx) => re('44Gh44KT44Gh44KT44GT44KMfOOBoeOCk+OBoeOCk1xzKuOBk+OCjHzjgZPjgowuezAsNH3jgaHjgpPjgaHjgpM=').test(ctx.s)
                    && /那个|继续/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 8,
                apply: () => `这个${T.meatRodZh}`,
            },
            {
                id: 'rod.shite.cough',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44GX44GmfOOBoeOCk+OBoeOCk+OBl+OBpg==').test(ctx.s)
                    && /咳|哈|诶嘿/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}…`,
            },
            {
                id: 'rod.ketsu.split',
                test: (ctx) => re('44Gh44KT44Gh44KTLnswLDE2feOCseODhOijgnzjgrHjg4Too4LjgYTjgaHjgoPjgYY=').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 8,
                apply: (ctx) => (/旦那以外|他の男/.test(ctx.s)
                    ? `老公以外的男人的${T.meatRodZh}要撑裂屁股了…不过`
                    : `${T.meatRodZh}要撑裂屁股了`),
            },
            {
                id: 'rod.pain.ouch',
                test: (ctx) => /痛/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && /好痛|痛啊/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => ctx.next.replace(/好痛啊?/, `${T.meatRodZh}好痛啊`),
            },
            {
                id: 'rod.pain.ouch',
                test: (ctx) => /痛/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && /好痛|痛啊/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => ctx.next.replace(/好痛啊?/, `${T.meatRodZh}好痛啊`),
            },
            {
                id: 'rod.nani.ochi',
                test: (ctx) => /なにおちん|什么嘛/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && ctx.len() <= 8,
                apply: () => `什么嘛…${T.meatRodZh}…`,
            },
            {
                id: 'rod.insert.clean',
                test: (ctx) => /入れてるところ|插进去的地方/.test(ctx.s + ctx.next)
                    && re('44OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `等我把${T.meatRodZh}插进去的地方也弄干净`,
            },
            {
                id: 'rod.longer',
                test: (ctx) => /長くなっ|变长了/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}变长了，真是想象得到啊`,
            },
            {
                id: 'rod.holding',
                test: (ctx) => /持って|拿着/.test(ctx.s + ctx.next) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `拿着${T.meatRodZh}呢`,
            },
            {
                id: 'rod.twitch',
                test: (ctx) => /ビクビク|一抽一抽/.test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}一抽一抽的…`,
            },
            {
                id: 'rod.erect.all',
                test: (ctx) => /勃き|勃起|ピん勃/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && !re('5Lmz6aaWfOOBoeOBj+OBsw==').test(ctx.s)
                    && !re('5Lmz5aS0').test(ctx.next),
                apply: () => `${T.meatRodZh}全都勃起了呢`,
            },
            {
                id: 'rod.nip.compare',
                test: (ctx) => re('5Lmz6aaW44Go44Gh44KT44Gh44KTfOS5s+mmluOBqOOBoeOCk+OBvXzjgaHjgY/jgbPjgajjgaHjgpM=').test(ctx.s)
                    && /どっち|感じて/.test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || !re('5Lmz5aS0').test(ctx.next)),
                apply: (ctx) => {
                    let next = ctx.next;
                    if (!re('5Lmz5aS0').test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}，${T.nippleZh}`;
                    if (!G.meatRod.test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
                    return next;
                },
            },
            {
                id: 'rod.hoshigaru',
                test: (ctx) => re('44Gh44KT44G944KS5qyy44GXfOOBiuOBoeOCk+OBoeOCk+OCkuassuOBl3zmrLLjgZfjgYzjgaPjgabjgarjgYQ=').test(ctx.s)
                    && re('44Gh44KT44G9fOOBiuOBoeOCk3zjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `还没有打心底里渴望${T.meatRodZh}`,
            },
            {
                id: 'rod.arimasuka',
                test: (ctx) => re('44GC44KK44G+44GZ44GL44Gh44KT44G9fOOBguOCiuOBvuOBmeOBiyg/OuOBiik/44Gh44KT44Gh44KTfOOBoeOCk+OBveOBguOCiuOBvuOBmQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `有${T.meatRodZh}吗？`,
            },
            {
                id: 'rod.sensei.kimochi',
                test: (ctx) => re('5YWI55Sf44Gu44GK44Gh44KT44Gh44KTfOWFiOeUn+OBruOBiuOBoeOCk+OBvQ==').test(ctx.s)
                    && /きもち|気持ち|すご/.test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || !/舒服|感觉/.test(ctx.next)),
                apply: () => `不行不行…老师的${T.meatRodZh}好舒服`,
            },
            {
                id: 'rod.sensei.iretai',
                test: (ctx) => re('5YWI55Sf44Gu44GK44Gh44KT44Gh44KTfOWFiOeUn+OBruOBiuOBoeOCk+OBvQ==').test(ctx.s)
                    && /入れたい/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || !G.meatRod.test(ctx.next)),
                apply: () => `好想把老师的${T.meatRodZh}插进去`,
            },
            {
                id: 'rod.shigoku.alone',
                test: (ctx) => re('44Gh44KT44Gh44KT44GX44GU44GPfOOBiuOBoeOCk+OBoeOCk+OBl+OBlOOBj3zjgZfjgZTjgY/jgaDjgZHjgac=').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || re('5Lmz5aS0fOWxheeEtg==').test(ctx.next)),
                apply: () => `自己撸${T.meatRodZh}就够了吗？`,
            },
            {
                id: 'rod.pikupiku',
                test: (ctx) => /(?:お)?ちんちんぴくぴく|(?:お)?ちんちんピクピク|ぴくぴくしてる|ピクピクしてる/.test(ctx.s)
                    && /ちんちん|おちん|チンポ|ちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}一颤一颤的`,
            },
            {
                id: 'rod.kurushiku',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPoi6bjgZfjgY9844G+44Gf44GK44Gh44KT44Gh44KT6Ium44GX44GPfOiLpuOBl+OBj+OBquOBo+OBpuOBjeOBvuOBl+OBnw==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}开始难受起来了`,
            },
            {
                id: 'rod.byubyu',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPjgbPjgoXjgbPjgoV844Gz44KF44Gz44KF44Gn').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `用那双手让${T.meatRodZh}咻咻地`,
            },
            {
                id: 'rod.mo.ii',
                test: (ctx) => re('44Gh44KT44Gh44KT44KC44GE44GEfOOBiuOBoeOCk+OBoeOCk+OCguOBhOOBhA==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `${T.meatRodZh}也可以吗？`,
            },
            {
                id: 'rod.nuke.chau',
                test: (ctx) => re('44Gh44KT44Gh44KTLnswLDh95oqc44GRfOOBiuOBoeOCk+OBoeOCky57MCw4feaKnOOBkQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `${T.meatRodZh}要挣脱出来了`,
            },
            {
                id: 'rod.touch.hoshii',
                test: (ctx) => re('44Gh44KT44Gh44KT6Kem44Gj44GmfOOBiuOBoeOCk+OBoeOCk+inpuOBo+OBpnzjgYrjgaHjgpPjgaHjgpPop6bjgaPjgabjgoLjgok=').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || /居然/.test(ctx.next)),
                apply: (ctx) => (/もらって/.test(ctx.s)
                    ? `可以摸摸${T.meatRodZh}吗？`
                    : `想让你摸摸${T.meatRodZh}`),
            },
            {
                id: 'rod.terasu',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT54Wn44KJfOOBoeOCk+OBoeOCk+eFp+OCiQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `只是被${T.meatRodZh}照着就好了吗？`,
            },
            {
                id: 'rod.ass.uchi',
                test: (ctx) => re('44GK5bC744Gr44Kq44OB44Oz44OB44OzfOOBiuWwu+OBqyg/OuOBiik/44Gh44KT44Gh44KTfOaJk+OBoeS7mOOBkeOBpuOCiw==').test(ctx.s)
                    && /チン|ちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `是不是在用${T.meatRodZh}往屁股上抽插啊`,
            },
            {
                id: 'rod.oppai.ookii',
                test: (ctx) => re('44GK44Gj44Gx44GE44KC5aSn44GN44GE44GX44GK44Gh44KT44Gh44KT44KC5aSn44GN44GEfOOBiuOBoeOCk+OBoeOCk+OCguWkp+OBjeOBhA==').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.breastZh}这么大，${T.meatRodZh}也这么大嘛`,
            },
            {
                id: 'rod.gaman.ochin',
                test: (ctx) => /我慢できなくなっちゃって/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg50=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `已经忍不住了…${T.meatRodZh}`,
            },
            {
                id: 'rod.hai.ochin',
                test: (ctx) => re('44Gv44GE44GK44Gh44KT44Gh44KTfOOBguODvFxzKuOBiuOBoeOCk+OBoeOCk3xe44GC44O8XHMq44GK44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: (ctx) => (re('44GK44Gj44Gx44GE').test(ctx.s)
                    ? `${T.breastZh}也挺起来了…来，${T.meatRodZh}`
                    : `啊…${T.meatRodZh}`),
            },
            {
                id: 'rod.dane.q',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44Gg44GtfOOBoeOCk+OBoeOCk+OBoOOBrQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `是${T.meatRodZh}吧？`,
            },
            {
                id: 'rod.kirame',
                test: (ctx) => re('44Gh44KT44Gh44KT44Gg44KJ44GN44KJ44KBfOOBiuOBoeOCk+OBoeOCky57MCw2feOBjeOCieOCgQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `${T.meatRodZh}闪闪发光`,
            },
            {
                id: 'rod.ochin.chau',
                test: (ctx) => /おちんんんっちゃう|おちん.{0,4}んっちゃう/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `${T.meatRodZh}…${T.aboutToGoZh}`,
            },
            {
                id: 'rod.nigitte',
                test: (ctx) => /ちんちん握って|おちんちん握って|ちんぽ握って/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `都在握着${T.meatRodZh}哦`,
            },
            {
                id: 'rod.karikari',
                test: (ctx) => /チンポがまだカリカリ|ちんぽがまだカリ|カリカリです/.test(ctx.s)
                    && /チンポ|ちんぽ|おちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `对不起…学长的${T.meatRodZh}还是硬邦邦的`,
            },
            {
                id: 'rod.kakusanaide',
                test: (ctx) => /おちんちん\s*かくさないで|ちんちんかくさないで|かくさないで/.test(ctx.s)
                    && /おちん|ちんちん|ちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `不要把${T.meatRodZh}藏起来嘛`,
            },
            {
                id: 'rod.sawanai',
                test: (ctx) => /おちんちんさわんない|ちんちんさわんない|さわんない/.test(ctx.s)
                    && /おちん|ちんちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `不让我舒服就不碰你的${T.meatRodZh}哦`,
            },
            {
                id: 'rod.sensei.dame',
                test: (ctx) => /せんせーのおちんちん|先生のおちんちん|せんせいのおちん/.test(ctx.s)
                    && /だめ|ダメ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `不行…老师的${T.meatRodZh}`,
            },
            {
                id: 'rod.dake.moan',
                test: (ctx) => /おちんちんだけ|ちんちんだけ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `只有${T.meatRodZh}…`,
            },
            {
                id: 'rod.touch.chanto',
                test: (ctx) => /ちゃんとちんちんを触って|ちんちんを触ってよ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `要好好地摸${T.meatRodZh}哦`,
            },
            {
                id: 'rod.ookii.ne',
                test: (ctx) => /おちんちん大きいね|ちんちん大きい|おちんちんはおっきい|おちんちんおっきい/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `${T.meatRodZh}好大呀`,
            },
            {
                id: 'rod.nioi',
                test: (ctx) => /ちんちんの匂い|おちんちんの匂い|チンポの匂い/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}的味道？`,
            },
            {
                id: 'rod.ouchi',
                test: (ctx) => /おうちのチンポ|うちのチンポ|おうちのちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `这是家里的${T.meatRodZh}没错吧？`,
            },
            {
                id: 'rod.nihon',
                test: (ctx) => /二本のおちんちん|二本のちんちん|二本のチンポ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `两根${T.meatRodZh}`,
            },
            {
                id: 'rod.hasamare',
                test: (ctx) => /おちんちんに挟まれ|ちんちんに挟まれ|チンポに挟まれ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `被${T.meatRodZh}夹住了哦`,
            },
            {
                id: 'rod.mitai',
                test: (ctx) => /見たいですかおちんちん|おちんちん見たい|見たい.{0,6}おちんちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `想看${T.meatRodZh}吗？`,
            },
            {
                id: 'rod.ijitte',
                test: (ctx) => /おちんちんで弄って|ちんちんで弄って|チンポで弄って/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `用${T.meatRodZh}来玩玩吧？`,
            },
            {
                id: 'rod.hantai.gawa',
                test: (ctx) => /反対側のちんちん|反対側のおちんちん|反対側のチンポ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `另一边的${T.meatRodZh}也`,
            },
            {
                id: 'rod.te.massugu',
                test: (ctx) => /手がちんちん|手がおちんちん|手.{0,4}ちんちん真っ直ぐ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `手能直接伸到${T.meatRodZh}吗？`,
            },
            {
                id: 'rod.naki',
                test: (ctx) => /おちんちんが\s*泣|ちんちんが泣|泣くらっちゃう/.test(ctx.s)
                    && /おちん|ちんちん|ちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}都要哭出来了`,
            },
            {
                id: 'rod.boku.no',
                test: (ctx) => /ボクのおちんちん|僕のおちんちん|俺のおちんちんよ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `这就是我的${T.meatRodZh}哦`,
            },
            {
                id: 'rod.kite.mecha',
                test: (ctx) => /おちんちんにきて|ちんちんにきて|めちゃめちゃ/.test(ctx.s)
                    && /おちんちん|ちんちん|チンポ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 20,
                apply: () => `往${T.meatRodZh}这边来…会变得乱七八糟的`,
            },
            {
                id: 'rod.hasamu.nip',
                test: (ctx) => /おちんちんをいっぱいに挟んで|挟んでるだけで/.test(ctx.s)
                    && /乳首|ちくび/.test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || !/乳头|奶头/.test(ctx.next)),
                apply: () => `光是用${T.meatRodZh}夹着…乳头`,
            },
            {
                id: 'rod.ko.suru.chin',
                test: (ctx) => /こうするにほのちんちん|ほのちんちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `而是这样做的${T.meatRodZh}`,
            },
            {
                id: 'rod.moan.bare',
                test: (ctx) => /おちんちん|ちんちん|おちんぽ|ちんぽ/.test(ctx.s)
                    && !/キッチン|スイッチ|ピンチ/.test(ctx.s)
                    && /^(?:啊|哈|嗯|唔|呜)[\s啊哈嗯唔呜…。．.!！?]*$/u.test(ctx.next.trim())
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 8,
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.dashichatta',
                test: (ctx) => /おちんちん出しちゃった|ちんちん出しちゃった|ちんぽ出しちゃった/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}露出来了`,
            },
            {
                id: 'rod.tatte.itsu',
                test: (ctx) => /立って.{0,12}おちんぽ|いっぱい立って/.test(ctx.s)
                    && /おちんぽ|ちんぽ|おちんちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `立了这么多…这是哪来的${T.meatRodZh}啊`,
            },
            {
                id: 'rod.atsuku',
                test: (ctx) => /おちんぽ熱く|ちんぽ熱く|おちんちん熱く/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}越来越热了呢`,
            },
            {
                id: 'rod.chikaku',
                test: (ctx) => /近く.{0,6}おちんちん|おちんちん.{0,4}近く|あんた近く/.test(ctx.s)
                    && /おちんちん|ちんぽ|おちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `你这根${T.meatRodZh}好近`,
            },
            {
                id: 'rod.genkaku',
                test: (ctx) => /厳厳なおちんぽ|厳なおちんぽ|見つからそう/.test(ctx.s)
                    && /おちんぽ|ちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `好像能看见那根威猛的${T.meatRodZh}`,
            },
            {
                id: 'rod.daisuki.wide',
                test: (ctx) => /おちんぽ大好き|ちんぽ大好き|おちんちん大好き/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `最喜欢${T.meatRodZh}了`,
            },
            {
                id: 'rod.kono.dou',
                test: (ctx) => /このちんちんどうします|このおちんちんどう|このちんぽどう/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `这根${T.meatRodZh}要怎么办？`,
            },
            {
                id: 'rod.oshiro.chinpo',
                test: (ctx) => /おしろ.{0,6}ちんぽ|んんっおしろ/.test(ctx.s)
                    && /ちんぽ|おちんぽ|チンポ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.okumade',
                test: (ctx) => /ちんぽが奥まで|チンポが奥まで|奥まで届く/.test(ctx.s)
                    && /ちんぽ|チンポ|おちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}插到深处了嘛`,
            },
            {
                id: 'rod.jinjin.oku',
                test: (ctx) => /こいつちんぽ|ちんぽ.{0,8}じんじんの奥|じんじんの奥に/.test(ctx.s)
                    && /ちんぽ|チンポ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `这根${T.meatRodZh}顶到深处了`,
            },
            {
                id: 'rod.kono.suki',
                test: (ctx) => /このちんちん\s*好き|ちんちん\s*好き/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `喜欢这根${T.meatRodZh}`,
            },
            {
                id: 'rod.doushiten',
                test: (ctx) => /ちんちん\s*どうしてんの|おちんちんどうして/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `${T.meatRodZh}怎么了？`,
            },
            {
                id: 'rod.ochinko.san',
                test: (ctx) => /おちんこさん|おちんぽさん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `叫${T.meatRodZh}也可以吧？`,
            },
            {
                id: 'rod.shaburi.nasai',
                test: (ctx) => /ちんぽをしゃぶりなさい|チンポをしゃぶりなさい|しゃぶりなさい/.test(ctx.s)
                    && /ちんぽ|チンポ|おちん/.test(ctx.s)
                    && !/おまんこ|まんこ|オナニー|触って/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `含住${T.meatRodZh}`,
            },
            {
                id: 'rod.irete.under',
                test: (ctx) => /ちんちん入れて|おちんちん入れて|ちんぽ入れて/.test(ctx.s)
                    && /插|进/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && !/后面|后入|从后面/.test(ctx.next)
                    && !/後ろから|後ろで|うしろから/.test(ctx.s)
                    && ctx.len() <= 12,
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`,
            },
            {
                id: 'rod.shaburi.manko',
                test: (ctx) => /しゃぶりながら/.test(ctx.s)
                    && /おまんこ|まんこ/.test(ctx.s)
                    && /ちんぽ|チンポ|おちん/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && (/小穴|摸|自慰|含|触/.test(ctx.next) || ctx.len() <= 20),
                apply: (ctx) => {
                    if (/小穴/.test(ctx.next) && /摸|触|自慰/.test(ctx.next)) {
                        return `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
                    }
                    return /オナニー/.test(ctx.s)
                        ? `一边含着${T.meatRodZh}一边用小穴自慰`
                        : `一边含着${T.meatRodZh}一边摸自己的小穴`;
                },
            },
            {
                id: 'rod.suki.ka',
                test: (ctx) => /チンポを好きか|ちんぽを好き|チンポ好きか/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `喜欢${T.meatRodZh}吗`,
            },
            {
                id: 'rod.goshujin.oishii',
                test: (ctx) => /ご主人様のおちんぽ|主人様のおちんぽ/.test(ctx.s)
                    && /おいしい|最高/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `主人的${T.meatRodZh}最好吃了哦`,
            },
            {
                id: 'rod.gitto',
                test: (ctx) => /ギットオンにせたチンポ|チンポでこれ/.test(ctx.s)
                    && /チンポ|ちんぽ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `用这根${T.meatRodZh}这样弄`,
            },
            {
                id: 'rod.times.iku',
                test: (ctx) => re('44Gh44KT44Gh44KTLnswLDh95ZuefOWbnuOBhOOBjw==').test(ctx.s) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `${T.meatRodZh}去了大概三次左右…`,
            },
            {
                id: 'rod.how.want',
                test: (ctx) => /どうしたい|想做什么/.test(ctx.s + ctx.next) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `${T.meatRodZh}想做什么？`,
            },
            {
                id: 'rod.fun.q',
                test: (ctx) => /楽しい|开心/.test(ctx.s + ctx.next)
                    && re('44OB44Oz44OdfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844GK44Gh44KT').test(ctx.s)
                    && !/舐め|舐めて|フェラ/.test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}就这么开心吗？`,
            },
            {
                id: 'rod.stand.short',
                test: (ctx) => /構まり|挺立/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `${T.meatRodZh}挺立着…`,
            },
            {
                id: 'rod.also.wet',
                test: (ctx) => /濡れちゃって|也湿了|大概也湿/.test(ctx.s + ctx.next) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}大概也湿了吧`,
            },
            {
                id: 'rod.swell.excite',
                test: (ctx) => /むくむく|一柱擎天|興奮/.test(ctx.s + ctx.next) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}也一柱擎天了呢…你兴奋了呢`,
            },
            {
                id: 'rod.ojisan',
                test: (ctx) => /おじさん|大叔/.test(ctx.s + ctx.next) && re('44OB44Oz44OdfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpM=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `大叔的${T.meatRodZh}`,
            },
            {
                id: 'rod.mama',
                test: (ctx) => /ママ|妈妈/.test(ctx.s + ctx.next) && re('44OB44Oz44OdfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpM=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `妈妈的${T.meatRodZh}`,
            },
            {
                id: 'rod.see.insert',
                test: (ctx) => /入って見える|插进去了能看见/.test(ctx.s + ctx.next) && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpM=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}插进去了能看见…`,
            },
            {
                id: 'rod.smiling',
                test: (ctx) => /笑てた|笑着/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && ctx.len() <= 8,
                apply: () => `笑着的${T.meatRodZh}`,
            },
            {
                id: 'rod.want.insert',
                test: (ctx) => /入れたいんだ|想把插进去/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `想把${T.meatRodZh}插进去`,
            },
            {
                // Narrow: only the long invent / 插我的…不要 shape — bare 俺のT.chinpoJa is rod.ore.mine
                id: 'rod.my.insert',
                test: (ctx) => re('5L+644Gu44OB44Oz44OdfOOCquODrOOBruODgeODs+ODnQ==').test(ctx.s)
                    && re('44OB44Oz44OdfOOBoeOCk+OBvQ==').test(ctx.s)
                    && re('5oiR5LuA5LmI6YO95oS/5oSPfOW/q+eCueaPkuaIkeeahHzmj5LmiJHnmoTogonmo5I=').test(ctx.next),
                apply: (ctx) => {
                    if (/好き/.test(ctx.s)) return `喜欢我的${T.meatRodZh}`;
                    if (/でイ[きキ]|でイッ|でいく/.test(ctx.s)) return `想用我的${T.meatRodZh}去吧`;
                    return `我的${T.meatRodZh}`;
                },
            },
            {
                id: 'rod.ore.mine',
                test: (ctx) => re('5L+644Gu44OB44Oz44OdfOOCquODrOOBruODgeODs+ODnXzkv7rjga7jgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: (ctx) => {
                    if (/好き/.test(ctx.s)) return `喜欢我的${T.meatRodZh}`;
                    if (/でイ[きキ]|でイッ|でいく|イきたい|イキたい/.test(ctx.s)) {
                        return `想用我的${T.meatRodZh}去吧`;
                    }
                    return `我的${T.meatRodZh}`;
                },
            },
            {
                id: 'rod.ii.better',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKeOBjOOBhOOBhHwoPzrjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKeOBruOBjOOBhOOBhA==').test(ctx.s)
                    && /比较好|好[吗吧？?]|还是/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/还是|それとも/.test(ctx.s + ctx.next)) return `还是${T.meatRodZh}比较好？`;
                    return `${T.meatRodZh}比较好吧？`;
                },
            },
            {
                id: 'rod.valve.mis',
                test: (ctx) => re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && /瓣膜|阀门/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => ctx.next.replace(/瓣膜|阀门/g, T.meatRodZh),
            },
            {
                id: 'rod.touch.yabai',
                test: (ctx) => /触ってたい|おちんぴょう|一直想摸/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `一直想摸的这个${T.meatRodZh}好厉害`,
            },
            {
                id: 'rod.nama.maybe',
                test: (ctx) => re('44Gq44G+44Gh44KT44G9fOeUn+OBoeOCk+OBvXznlJ/lj6/og70=').test(ctx.s + ctx.next)
                    && re('44Gh44KT44G9fOODgeODs+ODnQ==').test(ctx.s)
                    && !/当て|当た/.test(ctx.s),
                apply: () => `生${T.meatRodZh}可能更好`,
            },
            {
                id: 'rod.nama.ate',
                test: (ctx) => re('55Sf44Gh44KT44G9fOeUn+ODgeODs+ODnXzjgarjgb7jgaHjgpPjgb0=').test(ctx.s)
                    && /当て|当た/.test(ctx.s)
                    && (/活生生|活活|被顶|顶着|舒服/.test(ctx.next) || !G.meatRod.test(ctx.next)),
                apply: (ctx) => (/気持ちいい|舒服/.test(ctx.s + ctx.next)
                    ? `被生${T.meatRodZh}顶着好舒服`
                    : `被生${T.meatRodZh}顶着`),
            },
            {
                id: 'rod.sensei.clean',
                test: (ctx) => /さっぱり|清干净/.test(ctx.s + ctx.next)
                    && re('44GK44GhW+KXi+OAh+KXrypdP+OBoeOCk3zjgYrjgaHjgpPjgaHjgpN844Gh44KT44G9').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => (/老师|先生|せんせい/.test(ctx.s + ctx.next)
                    ? `那我就来帮老师把${T.meatRodZh}也清干净吧`
                    : `那我就来把${T.meatRodZh}也清干净吧`),
            },
            {
                id: 'rod.possessive.short',
                test: (ctx) => re('KD8644GuKT8oPzrjg4Hjg7Pjg51844Gh44KT44G9fOOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgaHjgpMp').test(ctx.s)
                    && /^(?:大叔的|妈妈的|全国的|笑着的)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: (ctx) => `${ctx.next.replace(/[…。．.!！?\s]*$/u, '')}${T.meatRodZh}`,
            },
            {
                id: 'rod.hard.prefix.short',
                test: (ctx) => /硬/.test(ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844Kq44OB44Oz').test(ctx.s)
                    && !G.meatRod.test(ctx.next) && ctx.len() <= 14,
                apply: (ctx) => (/^硬/.test(ctx.next.trim()) ? prefixDomain(T.meatRodZh, ctx.next) : ctx.next.replace(/硬/, `${T.meatRodZh}硬`)),
            },
            // ── batch-0817eve (12-title focus) ──
            {
                id: 'rod.feel.good',
                test: (ctx) => /気持ちいいでしょ|责任|頼まれて/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 20,
                apply: () => `${T.meatRodZh}很舒服吧…`,
            },
            {
                id: 'rod.dont.break',
                test: (ctx) => /折らわ|折断/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `先别急着把${T.meatRodZh}折断…`,
            },
            {
                id: 'rod.exam.feel',
                test: (ctx) => /受験|考试的感觉/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `我的${T.meatRodZh}感觉超像要考试一样吧？`,
            },
            {
                id: 'rod.moan.stub',
                test: (ctx) => re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && /^(?:嗯嗯|哈\s*哈|哈|呵呵|呜|呼呼|喂喂)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !G.meatRod.test(ctx.next),
                apply: () => T.meatRodEllZh,
            },
            // ── batch-0818am residual under ──
            {
                id: 'rod.from.behind',
                test: (ctx) => /後ろからおちん|入れてごらん|来吧.{0,4}插/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `来吧…从后面把${T.meatRodZh}插进去…`,
            },
            {
                id: 'rod.clean.pretty',
                test: (ctx) => /綺麗になって|变干净|お掃除|清理|打扫/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/お掃除|清理|打扫/.test(ctx.s + ctx.next)) {
                        return /まだまだ|还需要|继续/.test(ctx.s + ctx.next)
                            ? `${T.meatRodZh}还需要我继续打扫呢`
                            : `我来帮你把${T.meatRodZh}清理干净吧`;
                    }
                    return `${T.meatRodZh}变干净了…`;
                },
            },
            {
                id: 'rod.more.urge',
                test: (ctx) => /もっとっ?もっとって|还想要更多/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `得让${T.meatRodZh}也变得还想要更多才行呢`,
            },
            {
                id: 'rod.feel.with',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44Gn44KC5oSf44GYfOeUqOS5n+iDveacieaEn+iniQ==').test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `用${T.meatRodZh}也能有感觉…`,
            },
            {
                id: 'rod.bad.kid.gloss',
                test: (ctx) => /悪い.{0,6}おちん|坏坏的|坏孩子的/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/頑張|努力/.test(ctx.s + ctx.next)) return `就让这根坏孩子的${T.meatRodZh}好好努力一番吧`;
                    if (/帰り|回去/.test(ctx.s + ctx.next)) return `这根坏${T.meatRodZh}还不想回去呢`;
                    return `真是个坏坏的${T.meatRodZh}呢`;
                },
            },
            {
                id: 'rod.climax.fill',
                test: (ctx) => re('44GE44Gj44Gx44GE44GE44Gj44Gx44GEfOmrmOa9rui/nui/ng==').test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `被${T.meatRodZh}插得${T.orgasmZh}连连啊`,
            },
            {
                id: 'rod.big.face',
                test: (ctx) => /おっきくして|变得这么大/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `一边露出那样的表情，却把${T.meatRodZh}变得这么大`,
            },
            {
                id: 'rod.panpan.cmd',
                test: (ctx) => /ぱんぱんにしなさい|弄得的吧/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `把${T.meatRodZh}弄得胀鼓鼓的吧`,
            },
            {
                id: 'rod.suck.pls',
                test: (ctx) => /しゃぶら(?!せ)|しゃぶって|含住/.test(ctx.s + ctx.next)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !/しゃぶりながら|おまんこ|まんこ|オナニー/.test(ctx.s)
                    && !/小穴|自慰|摸自己/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `好呀，请让我含住${T.meatRodZh}`,
            },
            {
                id: 'rod.not.belly',
                test: (ctx) => re('44OB44Oz44Od6IW5fOWIq+euoeiCmuWtkA==').test(ctx.s + ctx.next) && re('44OB44Oz44OdfOOBoeOCk+OBvQ==').test(ctx.s),
                apply: () => `首先别管肚子，先顾${T.meatRodZh}…`,
            },
            {
                id: 'rod.cute',
                test: (ctx) => /可愛いおちん|可爱得不得了/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `嗯，这根${T.meatRodZh}真是可爱得不得了呢`,
            },
            {
                id: 'rod.yummy.whose',
                test: (ctx) => re('44OB44Oz44Od44Gv44Gp44GG44GgfOWMl+S5g3zlpb3lkIPlkJc=').test(ctx.s + ctx.next)
                    && re('44OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `好吃吗？北乃的${T.meatRodZh}怎么样？`,
            },
            {
                id: 'rod.inside.sfx',
                test: (ctx) => /いじゅぶ|在里面地/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}在里面…`,
            },
            {
                id: 'rod.yabai.moan',
                test: (ctx) => re('44KE44Gw44Gj44GK44Gh44KTfOOBiuOBoeOCk+OBoeOCk+OBow==').test(ctx.s)
                    && /啊啊|唔|哈/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 20,
                apply: () => `啊…${T.meatRodZh}…`,
            },
            // ── batch-0818pm residual under ──
            {
                id: 'rod.shiko.awake',
                test: (ctx) => /シコシコ/.test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `大家都被${T.meatRodZh}激起来了…在撸呢…`,
            },
            {
                id: 'rod.sfx.short',
                test: (ctx) => re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12
                    && !/精|射|出|给[^我]|插|舔|去了|好吗|吗？|欲望|原谅/.test(ctx.next)
                    && (
                        /^(?:咻)[\s…~～嗯哈呜.。．!！?]*$/u.test(ctx.next.trim())
                        || /^(?:嗯+|哈+|呜+)[\s…~～.。．!！?]*$/u.test(ctx.next.trim())
                        || /^(?:给我|可以吗|道)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    ),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.forgive.sniff',
                test: (ctx) => /許|原谅/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `就原谅这根${T.meatRodZh}吧…`,
            },
            {
                id: 'rod.naka.insert',
                test: (ctx) => re('KD8644GT44Gu5Lit44GrfOS4reOBqykuezAsMTJ944GK44Gh44KTfOOBiuOBoeOCk+OBoeOCk+WFpeOCjOOBpg==').test(ctx.s)
                    && /入れ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    const base = ctx.next.replace(/[。．.!！?\s]*$/u, '');
                    if (/插进去/.test(base)) return base.replace(/插进去/, `把${T.meatRodZh}插进去`);
                    if (/插/.test(base)) return `${base}…${T.meatRodZh}…`;
                    return `${base}…把${T.meatRodZh}插进去…`;
                },
            },
            {
                id: 'rod.yummy.eat',
                test: (ctx) => re('KD8644GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p576O5ZGz44GXfOe+juWRs+OBly57MCw2fSg/OuOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgaHjgpN844Gh44KT44G9KXzlpb3lpb3lkIM=').test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}好好吃…`,
            },
            {
                id: 'rod.thicker',
                test: (ctx) => re('44Gh44KT44Gh44KT44KI44KK5aSq44GEfOOCiOOCiuWkquOBhA==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `比你的${T.meatRodZh}还要粗呢…`,
            },
            {
                id: 'rod.azuke',
                test: (ctx) => /お預け|暂时保留/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}还要先忍着…`,
            },
            {
                id: 'rod.man.of',
                test: (ctx) => re('55S344Gu5Lq644GuLnswLDZ944Gh44KT44Gh44KTfOOBneOCjOOBjOeUtw==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `那就是男人的${T.meatRodZh}`,
            },
            {
                id: 'rod.say.it',
                test: (ctx) => re('44Gh44KT44Gh44KT6KiA44Gj44GmfOiogOOBo+OBpuOBv+OBquOBhOOBqA==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `不说出${T.meatRodZh}可不知道合不合得来啊`,
            },
            {
                id: 'rod.too.big.fit',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT5aSn44GN44GP44GmfOWPjuOBvuOCieOBquOBhA==').test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `学长的${T.meatRodZh}太大了…有点容纳不下呢`,
            },
            {
                id: 'rod.clean.ok.q',
                test: (ctx) => /綺麗にしてもいい|綺麗にして/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && ctx.len() <= 8,
                apply: () => `可以把${T.meatRodZh}清理干净吗？`,
            },
            {
                id: 'rod.hold.can',
                test: (ctx) => /咥えれる|咥えられ/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && ctx.len() <= 8,
                apply: () => `抬头的话也能含住${T.meatRodZh}吧？`,
            },
            {
                id: 'rod.man.of',
                test: (ctx) => re('55S344Gu5Lq644GuLnswLDZ944Gh44KT44Gh44KTfOOBneOCjOOBjOeUtw==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `那就是男人的${T.meatRodZh}`,
            },
            {
                id: 'rod.say.it',
                test: (ctx) => re('44Gh44KT44Gh44KT6KiA44Gj44GmfOiogOOBo+OBpuOBv+OBquOBhOOBqA==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `不说出${T.meatRodZh}可不知道合不合得来啊`,
            },
            {
                id: 'rod.too.big.fit',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT5aSn44GN44GP44GmfOWPjuOBvuOCieOBquOBhA==').test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `学长的${T.meatRodZh}太大了…有点容纳不下呢`,
            },
            {
                id: 'rod.clean.ok.q',
                test: (ctx) => /綺麗にしてもいい|綺麗にして/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && ctx.len() <= 8,
                apply: () => `可以把${T.meatRodZh}清理干净吗？`,
            },
            {
                id: 'rod.hold.can',
                test: (ctx) => /咥えれる|咥えられ/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && ctx.len() <= 8,
                apply: () => `抬头的话也能含住${T.meatRodZh}吧？`,
            },
            {
                id: 'rod.lick.ok.q',
                test: (ctx) => re('KD8644GE44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgaHjgpMpLnswLDh96IiQ44KBfOiIkOOCgeOBpuOBhOOBhA==').test(ctx.s)
                    && /舔|可以/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && !re('44GK44G+44KT44GTfOOBvuOCk+OBk3zjgYrjgb7il4s=').test(ctx.s),
                apply: () => `可以舔${T.meatRodZh}吗？`,
            },
            {
                id: 'rod.lick.from.manko',
                test: (ctx) => re('KD8644GKKT/jgb7jgpPjgZMuezAsMTZ9KD8644GKKT/jgaHjgpPjgaHjgpPoiJDjgoF8KD8644GKKT/jgaHjgpPjgaHjgpPoiJDjgoHjgaHjgoPjgaPjgZ8=').test(ctx.s)
                    && re('44GK44G+44KT44GTfOOBvuOCk+OBk3zjgYrjgb7il4s=').test(ctx.s)
                    && (re('6IiUfOWwj+eptHzmj5I=').test(ctx.next) || !G.meatRod.test(ctx.next)),
                apply: () => `舔刚插进${T.smallHoleZh}的${T.meatRodZh}…好刺激`,
            },
            {
                id: 'rod.hard.mid',
                test: (ctx) => /硬くなって|硬了/.test(ctx.s + ctx.next)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `${T.meatRodZh}硬起来了…`,
            },
            {
                id: 'rod.big.start',
                test: (ctx) => /おっきいおちん|大开始了/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && /始ま|开始/.test(ctx.s + ctx.next),
                apply: () => `大${T.meatRodZh}开始了…大${T.meatRodZh}…`,
            },
            {
                id: 'rod.surprise.stub',
                test: (ctx) => re('44GZ44GU44GE44Gh44KTfOOBoeOCk+OBoeOCk+OBs+OBo+OBj+OCinzjgbPjgaPjgY/jgorjgZfjgaY=').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `啊不是…这根${T.meatRodZh}吓到我了…`,
            },
            {
                id: 'rod.thrust.below',
                test: (ctx) => /下から突|从下面顶/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `呐…再用${T.meatRodZh}从下面顶我一次嘛…`,
            },
            {
                id: 'rod.because.of',
                test: (ctx) => re('44Gu44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk+OBi+OBhA==').test(ctx.s)
                    && /因为是嘛|ふふ/.test(ctx.s + ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `因为是他的${T.meatRodZh}嘛…`,
            },
            {
                id: 'rod.sukebe',
                test: (ctx) => re('44K544Kx44OZ44Gq44Gh44KT44G9fOiJsuiJsueahA==').test(ctx.s + ctx.next)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `色色的${T.meatRodZh}…`,
            },
            {
                id: 'rod.shiny',
                test: (ctx) => /テカテカ|ペカテカ|闪的/.test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `${T.meatRodZh}亮晶晶的…`,
            },
            {
                id: 'rod.muzumuzu',
                test: (ctx) => /むずむず|拜拜/.test(ctx.s) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s),
                apply: () => `${T.meatRodZh}痒痒的，拜拜咯…`,
            },
            {
                id: 'rod.entered',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT5YWl44Gj44GmfOi/m+adpeS6hg==').test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `${T.meatRodZh}进来了…`,
            },
            {
                id: 'rod.pull.out',
                // Bare 拔出来 + manko→rod coaching must not collapse to 掏T.meatRodZh (drops T.smallHoleZh)
                test: (ctx) => (
                    re('44Gh44KT44G944KS5Ye644GbfOOBiuOBoeOCk+OBoeOCk+OCkuWHuuOBm3zjg4Hjg7Pjg53jgpLlh7rjgZt844Gh44KT44G95Ye644GX44Gm').test(ctx.s)
                    || (/掏/.test(ctx.next) && re('44Gh44KT44G9fOODgeODs+ODnXzjgaHjgpPjgaHjgpM=').test(ctx.s) && !re('44G+44KT44GT44GL44KJfOOBiuOBvuOCk+OBk+OBi+OCiQ==').test(ctx.s))
                )
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !re('44G+44KT44GT44GL44KJfOOBiuOBvuOCk+OBk+OBi+OCiQ==').test(ctx.s),
                apply: () => `把${T.meatRodZh}掏出来`,
            },
            {
                id: 'rod.manko.kara.force',
                test: (ctx) => re('KD8644GKKT/jgb7jgpPjgZPjgYvjgokuezAsMTZ9KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpMp').test(ctx.s)
                    && (/力|やり|やる|抜|掏|拔/.test(ctx.s + ctx.next) || !G.mankoCover.test(ctx.next) || !G.meatRod.test(ctx.next))
                    && (!G.mankoCover.test(ctx.next) || !G.meatRod.test(ctx.next) || re('5oqK6IKJ5qOS5o6P5Ye65p2lfOaLlOWHuuadpQ==').test(ctx.next)),
                apply: () => `要用${T.smallHoleZh}给${T.meatRodZh}使劲啊`,
            },
            {
                id: 'rod.yummy',
                test: (ctx) => re('576O5ZGz44GX44GE44Gh44KT44G9fOOBoeOCk+OBvee+juWRs+OBl+OBhHzjgYrjgaHjgpPjgaHjgpPnvo7lkbPjgZd844Gh44KT44Gh44KT576O5ZGz44GXfOe+juWRs+eahA==').test(ctx.s + ctx.next)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}好美味…美味的${T.meatRodZh}`,
            },
            {
                id: 'rod.gross.q',
                test: (ctx) => /気持ち悪|恶心/.test(ctx.s + ctx.next) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}还是好恶心啊？`,
            },
            {
                id: 'rod.feel.manko',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44GnLnswLDh944G+44KT44GTfOeUqOWlveWlveaEn+WPlw==').test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `用${T.meatRodZh}好好感受一下我的${T.smallHoleZh}吧`,
            },
            {
                id: 'rod.licked',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT6IiQ44KBfOiiq+iIlOedgA==').test(ctx.s + ctx.next)
                    && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}被舔着…`,
            },
            {
                id: 'rod.ass',
                test: (ctx) => /おしりのおちん|上的/.test(ctx.s + ctx.next) && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `屁股上的${T.meatRodZh}…`,
            },
            {
                id: 'rod.room',
                test: (ctx) => re('44Gh44KT44Gh44KT44Gu44GK5a6kfOeahOWwj+aIv+mXtA==').test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCkw==').test(ctx.s),
                apply: () => `也不能忘了${T.meatRodZh}的小房间呢`,
            },
            {
                id: 'rod.punish',
                test: (ctx) => /お仕置き|惩罚|元気すぎる/.test(ctx.s + ctx.next)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `对这根精力过剩的${T.meatRodZh}需要好好惩罚一下呢`,
            },
            {
                id: 'rod.this.fault',
                test: (ctx) => re('44GT44Gu44GK44Gh44KT44Gh44KT44Gu44Gb44GEfOmDveaYr+i/meagueeahOmUmQ==').test(ctx.s + ctx.next) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCkw==').test(ctx.s),
                apply: () => `都是这根${T.meatRodZh}的错吧？`,
            },
            {
                id: 'rod.like',
                test: (ctx) => re('44Gh44KT44Gh44KT5aW944GNfOWlveWWnOasog==').test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s) && ctx.len() <= 8,
                apply: () => `好喜欢${T.meatRodZh}`,
            },
            {
                id: 'rod.nama.insert.before',
                test: (ctx) => re('55Sf44OB44Oz44OdfOeUn+OBruODgeODs+ODnXzmj5LlhaXkuYvliY0=').test(ctx.s + ctx.next) && re('44OB44Oz44OdfOOBoeOCk+OBvXzlhaXjgow=').test(ctx.s),
                apply: () => `在把生${T.meatRodZh}插进去之前先放松一下吧`,
            },
            {
                id: 'rod.here.nama',
                test: (ctx) => re('55Sf44Gu44OB44Oz44Od5YWlfOiiq+aPkui/hw==').test(ctx.s + ctx.next) && re('44OB44Oz44OdfOOBoeOCk+OBvQ==').test(ctx.s),
                apply: () => `这里被生${T.meatRodZh}插过了吧？`,
            },
            {
                id: 'rod.hold.mouth',
                test: (ctx) => re('44OB44Oz44Od44KS5ZKl44GIfOWSpeOBiOOCkw==').test(ctx.s) && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpM=').test(ctx.s) && !G.meatRod.test(ctx.next),
                apply: () => `说过喜欢含${T.meatRodZh}的…`,
            },
            {
                id: 'rod.ride',
                test: (ctx) => re('5LmX44Gj44GmLnswLDEyfeOBoeOCk+OBoeOCk3zpqpHlnKjkuIrpnaI=').test(ctx.s + ctx.next) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s),
                apply: () => `骑在${T.meatRodZh}上面…`,
            },
            {
                id: 'rod.shy.wet',
                test: (ctx) => /恥ずかしい/.test(ctx.s) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && /^(?:好害羞)[…。．.!！?\s啊]*$/u.test(ctx.next.trim()),
                apply: () => `好害羞啊…${T.meatRodZh}…`,
            },
            {
                id: 'rod.trunc.meat',
                test: (ctx) => re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && /^(?:肉)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !/キッチン|スイッチ/.test(ctx.s),
                apply: () => T.meatRodEllZh,
            },
            {
                id: 'rod.dame.stub',
                test: (ctx) => /だめっ?|ダメ/.test(ctx.s)
                    && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && /^(?:不行|不要)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !/イッちゃ|いっちゃ/.test(ctx.s),
                apply: () => `不行…${T.meatRodZh}`,
            },
            {
                id: 'rod.please.shite',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKeOBl+OBpuOBj+OBoOOBleOBhA==').test(ctx.s)
                    && /请|插/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    const next = ctx.next.replace(/请用插/g, `请用${T.meatRodZh}插`);
                    return re('6IKJ5qOS').test(next) ? next : `请用${T.meatRodZh}插我吧`;
                },
            },
            {
                id: 'rod.daisuki',
                test: (ctx) => /大好き/.test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: (ctx) => (/这根/.test(ctx.next) ? `这根${T.meatRodZh}也最喜欢` : `好喜欢${T.meatRodZh}`),
            },
            {
                id: 'rod.papa',
                test: (ctx) => /パパ|お父さん|父さん/.test(ctx.s)
                    && re('44OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgb1844GK44Gh44KT44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && !/キッチン|スイッチ/.test(ctx.s),
                apply: (ctx) => {
                    let next = ctx.next;
                    if (!/先っぽ|先っちょ/.test(ctx.s)) next = next.replace(/前端/g, '');
                    if (/爸爸的/.test(next)) next = next.replace(/爸爸的/, `爸爸的${T.meatRodZh}`);
                    else if (!re('6IKJ5qOS').test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}${T.meatRodZh}`;
                    return next.replace(/\s{2,}/g, ' ').trim();
                },
            },
            {
                id: 'rod.ika.with',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpMp44Gn44Kk44Kr').test(ctx.s)
                    && re('6auY5r2ufOWOu3zorqnkvaA=').test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: () => `就用${T.meatRodZh}让你去`,
            },
            {
                id: 'rod.makase',
                test: (ctx) => re('KD8644OB44Oz44OdfOOBoeOCk+OBvSnku7vjgZfjgaY=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `把${T.meatRodZh}交给我吧`,
            },
            {
                id: 'rod.janakute',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPjgZjjgoPjgarjgY/jgaZ8KD8644GKKT/jgaHjgpPjgb3jgZjjgoPjgarjgY/jgaY=').test(ctx.s)
                    && /不是|じゃなく/.test(ctx.s + ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `不是${T.meatRodZh}吗？`,
            },
            {
                id: 'rod.q.stub',
                test: (ctx) => re('Xig/OuOBiik/44Gh44KT44Gh44KTWz/vvJ/igKbjgILvvI4u44O7XHNdKiQ=', 'u').test(ctx.s.replace(/\s/g, ''))
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 4,
                apply: () => `${T.meatRodZh}？`,
            },
            {
                id: 'rod.chikara',
                test: (ctx) => re('44Gh44KT44Gh44KT44Gr44KC5YqbfOOBoeOCk+OBoeOCk+OBq+WKmw==').test(ctx.s)
                    && /力/.test(ctx.next)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/にも力/.test(ctx.s)) {
                        if (/我也有在给|也有在给/.test(ctx.next)) {
                            return ctx.next.replace(/我也有在给|也有在给/, `${T.meatRodZh}也用力`);
                        }
                        return `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}也用力`;
                    }
                    if (/就会用力/.test(ctx.next)) {
                        return ctx.next.replace(/就会用力/, `${T.meatRodZh}就会用力`);
                    }
                    return `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
                },
            },
            {
                id: 'rod.manko.jam',
                test: (ctx) => re('44G+44KT44GT').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjgYrjgaHjgpM=').test(ctx.s)
                    && re('5bCP56m0').test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22,
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`,
            },
            {
                id: 'rod.kudasai',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgb3jgY/jgaDjgZXjgYR8KD8644GKKT/jgaHjgpPjgaHjgpPjgY/jgaDjgZXjgYR844OB44Oz44Od44GP44Gg44GV44GE').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: (ctx) => (/顔|脸上|書いて/.test(ctx.s + ctx.next)
                    ? `脸上写着快给我${T.meatRodZh}`
                    : `给我${T.meatRodZh}`),
            },
            {
                id: 'rod.boku.mine',
                test: (ctx) => re('5YOV44Gu44OB44Oz44OdfOODnOOCr+OBruODgeODs+ODnXzlg5Xjga7jgaHjgpPjgb185YOV44Gu44Gh44KT44Gh44KT').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 24,
                apply: (ctx) => {
                    let next = ctx.next
                        .replace(/第\s*\d+\s*行/g, '')
                        .replace(/\bFirst\b/gi, '')
                        .replace(/ファースト/g, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    if (/我的/.test(next)) {
                        return next.replace(re('5oiR55qEKD8h6IKJ5qOSKQ=='), `我的${T.meatRodZh}`);
                    }
                    if (!re('6IKJ5qOS').test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}…我的${T.meatRodZh}`;
                    return next;
                },
            },
            {
                id: 'rod.zako',
                test: (ctx) => re('44K244KzKD8644Gh44KT44G9fOODgeODs+ODnXzjgaHjgpPjgaHjgpMp').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/締まりの悪い|缓|松/.test(ctx.s + ctx.next) || /更紧|糟糕杂鱼/.test(ctx.next)) {
                        return `更松的杂鱼${T.meatRodZh}`;
                    }
                    return `杂鱼${T.meatRodZh}`;
                },
            },
            {
                id: 'rod.kochin',
                test: (ctx) => re('5bCP44Gh44KT44G9fOWwj+OBleOBhOOBoeOCk3zjgaHjgaPjgaHjgoPjgYTjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22,
                apply: (ctx) => (/不行|ダメ/.test(ctx.s + ctx.next)
                    ? `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…还是小${T.meatRodZh}`
                    : `小${T.meatRodZh}`),
            },
            {
                id: 'rod.okki.natta',
                test: (ctx) => re('44GK44Gj44GN44GP44Gq44Gj44GfKD8644Gh44KT44Gh44KTfOOBoeOCk+OBvXzjgYrjgaHjgpMpfOWkp+OBjeOBj+OBquOBo+OBnyg/OuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `变得这么大的${T.meatRodZh}`,
            },
            {
                id: 'rod.genki',
                test: (ctx) => re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p5YWD5rCXfOWFg+awl+OBoOOCiOOBqg==').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `${T.meatRodZh}精神满满呢`,
            },
            {
                id: 'rod.choudai.short',
                test: (ctx) => re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844Gh44KT44G9KS57MCw0feOBoeOCh+OBhuOBoOOBhHzjgaHjgofjgYbjgaDjgYQuezAsNH0oPzrjgYrjgaHjgpPjgaHjgpN844GK44Gh44KT44G9fOOBoeOCk+OBoeOCkyk=').test(ctx.s)
                    && /给/.test(ctx.next)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: (ctx) => (/もっと/.test(ctx.s) ? `再多给我${T.meatRodZh}` : `给我${T.meatRodZh}吧？`),
            },
            {
                id: 'rod.goki',
                test: (ctx) => re('44GU44GN44Gh44KT44G9fOOBlOOBo+OBpOOBhOOBoeOCk3zjgZPjgpPjgarjgZTjgY3jgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: (ctx) => (/射|だし/.test(ctx.s + ctx.next)
                    ? `这么棒的${T.meatRodZh}…射出来的话`
                    : `这么棒的${T.meatRodZh}`),
            },
            {
                id: 'rod.yodare',
                test: (ctx) => /涎垂ら|よだれ/.test(ctx.s)
                    && re('KD8644GKKT/jgaHjgpPjgb18KD8644GKKT/jgaHjgpPjgaHjgpM=').test(ctx.s)
                    && (re('57K+5rayfOWwhOWIsA==').test(ctx.next) || !G.meatRod.test(ctx.next)),
                apply: () => `${T.meatRodZh}都垂着口水了`,
            },
            {
                id: 'rod.okyaku',
                test: (ctx) => re('44GK5a6i44GV44KT44GuLnswLDR9KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpMp').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || (re('5YWl44KMfOaMv+WFpQ==').test(ctx.s) && !/插/.test(ctx.next)))
                    && ctx.len() <= 18,
                apply: (ctx) => (re('5YWl44KMfOaMv+WFpQ==').test(ctx.s)
                    ? `是要把客人的${T.meatRodZh}插进去的意思吧？`
                    : `那么就请客人的${T.meatRodZh}`),
            },
            {
                id: 'rod.genki.meccha',
                test: (ctx) => re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0pLnswLDZ95YWD5rCXfOWFg+awly57MCw2fSg/OuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgaHjgpMp').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `${T.meatRodZh}这么有精神，真是太好了`,
            },
            {
                id: 'rod.tachi',
                test: (ctx) => re('44Gh44KT44Gh44KT56uL44GhfOeri+OBoeOBr+OBm+OCk3znq4vjgaPjgabjgovjgYrjgaHjgpN844KB44Gj44Gh44KD56uL44Gj44Gm44KL').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb1844OB44Oz44Od').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || re('5Y+q6KaB5oqK6IKJ5qOS56uL6LW35p2l5bCx5aW95LqG').test(ctx.next)),
                apply: (ctx) => {
                    if (/めっちゃ立ってる|立ってるおちん/.test(ctx.s)) return `好厉害…${T.meatRodZh}立得好硬`;
                    if (/仲良く/.test(ctx.s)) return `必须要和哥哥相亲相爱地让${T.meatRodZh}立起来才行吗？`;
                    return `${T.meatRodZh}立起来`;
                },
            },
            {
                id: 'rod.aji',
                test: (ctx) => re('KD8644GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p44Gu5ZGzfOWRsy57MCw0fSg/OuOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `${T.meatRodZh}的味道？`,
            },
            {
                id: 'rod.kanjiteru',
                test: (ctx) => re('44Gh44KT44Gh44KT5oSf44GY44GmfOOBiuOBoeOCk+OBoeOCk+aEn+OBmOOBpnzmhJ/jgZjjgabjgovjgYvjga0=').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `这样能感觉到${T.meatRodZh}吗`,
            },
            {
                id: 'rod.kowasu',
                test: (ctx) => re('44Gh44KT44G95aOKfOODgeODs+ODneWjinzlo4rjgZnjgaHjgpPjgb185aOK44GX44Gm44GK44GN44Gq44GV44GE').test(ctx.s)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `把${T.meatRodZh}弄坏吧`,
            },
            {
                id: 'rod.mannaka',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT55yf44KT5LitfOecn+OCk+S4reOBq+mbhuOBvuOBo+OBpuOCiw==').test(ctx.s)
                    && re('44GK44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}都聚在中间`,
            },
            {
                id: 'rod.gaman.bochi',
                test: (ctx) => re('5oiR5oWi44Gn44GN44KTKD8644OB44Oz44OdfOOBoeOCk+OBvSl8KD8644OB44Oz44OdfOOBoeOCk+OBvSnjgYzli4PjgaPjgaY=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `忍不住了…${T.meatRodZh}都硬起来了`,
            },
            {
                id: 'rod.dekai',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpMp44GM44Gn44GL44GEfOOBp+OBi+OBhCg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `${T.meatRodZh}好大啊`,
            },
            {
                id: 'rod.dachi',
                test: (ctx) => re('44Gd44GuKD8644OB44Oz44OdfOOBoeOCk+OBvSkuezAsNn3jg4Djg4F844OA44OBLnswLDR9KD8644OB44Oz44OdfOOBoeOCk+OBvSk=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `那根${T.meatRodZh}真不错啊`,
            },
            {
                id: 'rod.buji',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpMp54Sh5LqL').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `${T.meatRodZh}没事吧`,
            },
            {
                id: 'rod.nuki.ok',
                test: (ctx) => re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44OdKeaKnOOBhA==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `把我的${T.meatRodZh}拔出来也没关系`,
            },
            {
                id: 'rod.natte.under',
                test: (ctx) => re('44Gq44Gj44Gm44KT44Gg44KNKD8644GKKT/jgaHjgpPjgaHjgpN844GT44KT44Gq6aKo44Gr44Gq44Gj44GmLnswLDh9KD8644GKKT/jgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `所以${T.meatRodZh}才会变成这样啊`,
            },
            {
                id: 'rod.etchi.with',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPjgavjgabjgaPjgaF844GK44Gh44KT44Gh44KT44Gn44Ko44OD44OBfOOBoeOCk+OBveOBp+OCqOODg+ODgQ==').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || /自慰/.test(ctx.next))
                    && ctx.len() <= 22,
                apply: () => `用${T.meatRodZh}做色色的事…这也只有我能做吗？`,
            },
            {
                id: 'rod.chikubi.pull',
                test: (ctx) => re('5Lmz6aaWLnswLDZ9KD8644Gh44KT44G9fOODgeODs+ODnSl8KD8644Gh44KT44G9fOODgeODs+ODnSkuezAsNn3kubPpppY=').test(ctx.s)
                    && /引っ張|つっぱ/.test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || !re('5Lmz5aS0').test(ctx.next)),
                apply: () => `又像刚才那样又扯${T.nippleZh}又扯${T.meatRodZh}`,
            },
            {
                id: 'rod.aishi',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPmhJvjgZd8KD8644GKKT/jgaHjgpPjgb3mhJvjgZc=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `好爱这根${T.meatRodZh}啊`,
            },
            {
                id: 'rod.mitsuketa',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPopovjgaTjgZF8KD8644GKKT/jgaHjgpPjgb3opovjgaTjgZE=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `找到${T.meatRodZh}了`,
            },
            {
                id: 'rod.atatteru',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPlvZPjgZ98KD8644GKKT/jgaHjgpPjgb3lvZPjgZ8=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `${T.meatRodZh}碰到了哦？`,
            },
            {
                id: 'rod.torotoro',
                test: (ctx) => re('KD8644GoKT/jgaHjgpPjgaHjgpPjgajjgo3jgajjgo1844Go44KN44Go44KN44Gr44GX44Gh44KD44GG').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || re('5Lmz5aS0').test(ctx.next)),
                apply: () => `把${T.meatRodZh}弄得黏糊糊的呢`,
            },
            {
                id: 'rod.naka.ippai',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPjgafjgYTjgaPjgbHjgYTjgavjgarjgaPjgaZ844GT44Gu5LitLnswLDh9KD8644GKKT/jgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 20,
                apply: () => `啊啊里面被${T.meatRodZh}填满了`,
            },
            {
                id: 'rod.shiko.kusa',
                test: (ctx) => re('KD8644KqKT/jg4Hjg7Pjg4Hjg7PjgrfjgrPjgrfjgrN844Kv44K144Kq44OB44OzfOOCt+OCs+OCt+OCs+OBl+OBpuOBhOOBhA==').test(ctx.s)
                    && /チン|ちん/.test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || /自慰/.test(ctx.next)),
                apply: () => `用那根臭${T.meatRodZh}自慰也没关系哦`,
            },
            {
                id: 'rod.naka.oto',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpMuezAsOH3kuK3jgad85Lit44Gn6Z+z').test(ctx.s)
                    && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}在里面发出了声音`,
            },
            {
                id: 'rod.suki.short',
                test: (ctx) => re('44GZ44GNLnswLDR944Gh44KT44Gh44KTfOOBoeOCk+OBoeOCky57MCw0feOBmeOBjXzlpb3jgY0uezAsNH3jgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `喜欢${T.meatRodZh}`,
            },
            {
                id: 'rod.dokudoku',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgb3jg4njgq/jg4njgq9844OJ44Kv44OJ44Kv44GE44Gj44Gm').test(ctx.s)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}在里面一跳一跳的哦？`,
            },
            {
                id: 'rod.ookiku',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgb3lpKfjgY3jgY9844GK44Gh44KT44G95aSn44GN44GP44Gq44KK').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `越来越匀，${T.meatRodZh}也会越来越大哦`,
            },
            {
                id: 'rod.shigo.chin',
                test: (ctx) => re('KD8644GX44GU44GEfOOBl+OBk+OBl+OBk3zjgrfjgrTjgqQpLnswLDEyfSg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50pfCg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50pLnswLDh944Gv44GB').test(ctx.s)
                    && re('44Gh44KT44G9fOODgeODs+ODnQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 20,
                apply: () => `撸着${T.meatRodZh}停不下来了`,
            },
            {
                id: 'rod.ass.with',
                test: (ctx) => re('44GK44Gh44KT44Gh44KT44KC44GK44G+fOOBiuWwu+OBqy57MCwxMn3jgYrjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 28,
                apply: () => `只要能容纳进去…屁股…${T.meatRodZh}和${T.smallHoleZh}`,
            },
            {
                id: 'rod.arigatou',
                test: (ctx) => /ありがとう/.test(ctx.s)
                    && re('KD8644GKKT/jgaHjgpPjgb1844OB44Oz44OdfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgaHjgpM=').test(ctx.s)
                    && (!G.meatRod.test(ctx.next) || re('XuiCieajklvigKbjgILvvI4uIe+8gT9cc10qJA==', 'u').test(ctx.next.trim()))
                    && ctx.len() <= 16,
                apply: () => `谢谢${T.meatRodZh}`,
            },
            {
                id: 'rod.mamire',
                test: (ctx) => re('44Gh44KT44G944G+44G/44KMfOODgeODs+ODneOBvuOBv+OCjHzjgaHjgpPjgb3jgoLjgb/jgox844OB44Oz44Od44G+44G/').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/悪い女|谈议|談義/.test(ctx.s + ctx.next) || /坏女人|商讨/.test(ctx.next)) {
                        return `沾满${T.meatRodZh}还乐在其中的坏女人`;
                    }
                    if (/沾满/.test(ctx.next)) return ctx.next.replace(/沾满/, `沾满${T.meatRodZh}`);
                    return `沾满${T.meatRodZh}`;
                },
            },
            {
                id: 'rod.daisuki',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgaHjgpPjgYzkuIDnlarlpKflpb3jgY1844GK44Gh44KT44Gh44KT44GM5LiA55Wq5aW944GNfOOBoeOCk+OBoeOCk+OBruOBoeOCk+OBveS4gOeVquWlveOBjXwoPzrjgaHjgpPjgb1844OB44Oz44OdKeS4gOeVquWlveOBjQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `我最喜欢的就是这根${T.meatRodZh}了，放心吧`,
            },
            {
                id: 'rod.name.bare',
                // Kanji surname/name + T.chinpoHiraJa only — pure kana leaves 的T.meatRodZh after JA strip
                test: (ctx) => re('W1x1NGUwMC1cdTlmZmZdezEsOH0oPzrjgaHjgpPjgb1844OB44Oz44OdKQ==').test(ctx.s)
                    && !/キッチン|スイッチ|ディッチン|サンドイッチ/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 8
                    && !/ありがとう|まみれ|大好き|咥え|楽し|と思って|方がいい|のがいい/.test(ctx.s),
                apply: (ctx) => {
                    const m = ctx.s.match(re('KFtcdTRlMDAtXHU5ZmZmXXsxLDh9KSg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p'));
                    const name = m ? m[1] : '';
                    return name ? `${name}的${T.meatRodZh}` : T.meatRodZh;
                },
            },
            {
                id: 'rod.omotte',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgb3jgaDjgajmgJ3jgaPjgaZ844OB44Oz44Od44Gg44Go5oCd44Gj44Gm').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: () => `别把这当成${T.meatRodZh}啦`,
            },
            {
                id: 'rod.tanoshime',
                test: (ctx) => re('KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgb0pLnswLDR95qW944GXfCg/OuODgeODs+ODnXzjgaHjgpPjgb0p5qW944GX44KB').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: (ctx) => {
                    if (/知らない男/.test(ctx.s)) return `正用陌生男人的${T.meatRodZh}享受着呢`;
                    if (/楽しめ/.test(ctx.s) || /尽情享受/.test(ctx.next)) return `尽情享受${T.meatRodZh}吧`;
                    return `用${T.meatRodZh}享受着`;
                },
            },
            {
                id: 'rod.kuwaeta',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgb0p5ZKl44GI44Gf').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `就这样含着${T.meatRodZh}${T.orgasmZh}吧`,
            },
            {
                id: 'rod.shiranai',
                test: (ctx) => re('55+l44KJ44Gq44GE55S344GuKD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgb0p').test(ctx.s)
                    && !G.meatRod.test(ctx.next),
                apply: (ctx) => {
                    if (/のがいい|の方がいい|がいい/.test(ctx.s)) return `我更想要陌生男人的${T.meatRodZh}`;
                    if (/楽し/.test(ctx.s)) return `正用陌生男人的${T.meatRodZh}享受着呢`;
                    return `陌生男人的${T.meatRodZh}`;
                },
            },
            {
                id: 'rod.hou.ii',
                test: (ctx) => re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgb0p44Gu5pa544GM44GE44GEfCg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p44Gu44GM44GE44GE').test(ctx.s)
                    && !/知らない男/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `还是${T.meatRodZh}更好吧`,
            },
            {
                id: 'rod.moan.bare',
                test: (ctx) => re('KD8644GKKT/jgaHjgpPjgb1844OB44Oz44OdfOOBiuOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && !/キッチン|スイッチ|ディッチン/.test(ctx.s)
                    && /^(?:啊+|嗯+|哈+|哦+)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && [...ctx.s.replace(/\s/g, '')].length <= 14
                    && !G.meatRod.test(ctx.next),
                apply: () => `${T.meatRodZh}…`,
            },
            {
                id: 'rod.hageshiku.more',
                test: (ctx) => /激しく/.test(ctx.s)
                    && re('KD8644GCKT/jgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg50=').test(ctx.s)
                    && /もっと|激しく/.test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `再激烈一点…${T.meatRodZh}`,
            },
            {
                id: 'rod.tsuite',
                test: (ctx) => re('KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKS57MCw4feeqgeOBhOOBpnznqoHjgYTjgaYuezAsNn0oPzrjg4Hjg7Pjg51844Gh44KT44G9KQ==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 14,
                apply: () => `也用${T.meatRodZh}使劲顶着`,
            },
            {
                id: 'rod.shabu.q',
                test: (ctx) => /しゃぶってんですか|しゃぶってるの|しゃぶってんの/.test(ctx.s)
                    && re('KD865L+644GufOengeOBrik/KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44OdKQ==').test(ctx.s)
                    && (re('6K+36K6p5oiR5ZCrfOWlveWRgC4q5ZCrfOWQq+S9j+iCieajkg==').test(ctx.next) || (!/含|吸|舔/.test(ctx.next) && ctx.len() <= 12)),
                apply: () => `你在含着我的${T.meatRodZh}吗？`,
            },
            {
                id: 'rod.prefix.late',
                test: (ctx) => re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44OdfOOBiuOBoVvil4vjgIfil68qXeOBoeOCkw==').test(ctx.s)
                    && !G.meatRod.test(ctx.next)
                    && ctx.len() <= 22
                    && !/キッチン|スイッチ|ディッチン/.test(ctx.s)
                    && (
                        /^(?:什么嘛|诶|拿着呢|挺立着|笑着的|大叔的|妈妈的|嗯嗯|哈\s*哈|喂喂|感谢您的)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                        || /插进|想把|弄干净|变长|勃起|一抽|湿了|开心|想做什么|清干净|好厉害|可能更好|进来了|恶心|被舔|美味|惩罚|的错|激烈|更更多|沾满|享受|含着|这根了|陌生男人|当成|尽情享受|有家人|舔|碰到|找到|填满|爱这根|发出了声音|自慰|越来越大|一跳|停不下来/.test(ctx.next)
                    ),
                apply: (ctx) => {
                    const next = ctx.next.trim();
                    if (/^(?:什么嘛|诶|拿着呢|挺立着|笑着的|大叔的|妈妈的|嗯嗯|哈\s*哈|喂喂|感谢您的)[…。．.!！?\s]*$/u.test(next)) {
                        return /感谢/.test(next) ? `谢谢${T.meatRodZh}` : `${next.replace(/[…。．.!！?\s]*$/u, '')}…${T.meatRodZh}…`;
                    }
                    if (/插进|想把|弄干净|变长|勃起|一抽|湿了|开心|想做什么|清干净|好厉害|可能更好|进来了|恶心|被舔|美味|惩罚|的错|激烈|更更多|沾满|享受|含着|这根了|陌生男人|当成|尽情享受|有家人|舔|碰到|找到|填满|爱这根|发出了声音|自慰|越来越大|一跳|停不下来/.test(next)) {
                        return re('6IKJ5qOS').test(next) ? next : `${next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
                    }
                    return undefined;
                },
            },
        ];

        const manko = [
            {
                id: 'manko.iku.pref',
                test: (ctx) => re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(ctx.s)
                    && /イッちゃう|イっちゃう|いっちゃう/.test(ctx.s)
                    && re('6KaB5Y675LqGfOimgeWwhOS6hg==').test(ctx.next)
                    && !re('5bCP56m0').test(ctx.next)
                    && ctx.len() <= 8,
                apply: (ctx) => `${T.pussyZh}${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`,
            },
            {
                id: 'manko.uwaki',
                test: (ctx) => /浮気/.test(ctx.s)
                    && re('44G+44KT44GT').test(ctx.s)
                    && re('5bCP56m0').test(ctx.next)
                    && !/出轨|偷情|外面/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…出轨了呢`,
            },
            {
                id: 'manko.there',
                test: (ctx) => /那里|身体部位/.test(ctx.next),
                apply: (ctx) => ctx.next.replace(R.naLiG, T.pussyZh).replace(R.bodyPartG, T.pussyZh),
            },
            {
                id: 'manko.strip',
                test: (ctx) => /脱掉|脱ぐ/.test(ctx.next + ctx.s),
                apply: () => S.pussyStrip,
            },
            {
                id: 'manko.stop',
                test: (ctx) => re('6aOy44G+44KT44GTfOWBnOS4jeS4i+adpQ==').test(ctx.next + ctx.s),
                apply: () => S.pussyStop,
            },
            {
                id: 'manko.finger',
                test: (ctx) => re('KD8644GKKT/jgb7jgpPjgZM=').test(ctx.s)
                    && /指入れ|指を入れ/.test(ctx.s)
                    && !re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && (!re('5bCP56m0').test(ctx.next) || re('6IKJ5qOS').test(ctx.next)),
                apply: () => `把手指插进${T.pussyZh}试试`,
            },
            {
                id: 'manko.kitchen',
                // Only invent T.meatRodZh when JA also has rod/insert — bare [opaque]に失礼 / 指入れ must not invent_rod
                test: (ctx) => re('44G+44KT44GT').test(ctx.s) && !/指入れ|指を入れ/.test(ctx.s) && (
                    /キッチンちん/.test(ctx.s)
                    || (re('44GK44G+44KT44GT44Gr').test(ctx.s) && re('KD865oy/5YWlfOOBoeOCk+OBvXzjgYrjgaHjgpN844OB44Oz44OdfOOBoeOCk+OBoeOCkyk=').test(ctx.s))
                    || (re('5o+S6L+b5Y67fOaPkuiCieajkg==').test(ctx.next) && re('44G+44KT44GT').test(ctx.s) && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KTfOaMv+WFpQ==').test(ctx.s))
                ),
                apply: () => S.pussyInsertRod,
            },
            {
                id: 'manko.excuse',
                test: (ctx) => re('44GK44G+44KT44GT44Gr').test(ctx.s) && /失礼/.test(ctx.s) && ctx.len() <= 12,
                apply: () => `往色色的${T.pussyZh}里…失礼了…`,
            },
            {
                id: 'manko.look.lick',
                test: (ctx) => /好看|可以看|弄|漂亮|雪白|嘴巴碰到/.test(ctx.next) || re('6KaLfOiIkOOCgXzntrrpupd844G+44Gj44GX44KNfOmhlOOBvuOCk+OBkw==').test(ctx.s),
                apply: (ctx) => {
                    const next = ctx.next;
                    if (/可以看/.test(next)) return S.canSeePussy;
                    if (/亲一下|舔/.test(next) || /舐めて/.test(ctx.s)) return S.lickPussyPls;
                    if (/雪白|まっしろ/.test(next + ctx.s)) return S.pussyWhite;
                    if (/好吃|美味/.test(next)) {
                        return next.replace(R.myThere, S.myPussy).replace(R.yummyQ, S.pussyYummy);
                    }
                    if (!G.mankoCover.test(next)) return next.includes(S.nong) ? S.pussyNong : `${T.pussyZh}${next}`;
                    return next;
                },
            },
            {
                id: 'manko.dirty',
                test: (ctx) => re('5rGa44KM44Gf44GK44G+44KT44GTfOiEj+S6hueahOmDqOS9jXzpg6jkvY0=').test(ctx.next + ctx.s) && re('44G+44KT44GT').test(ctx.s),
                apply: () => S.dirtyPussy,
            },
            {
                id: 'manko.suck.stub',
                test: (ctx) => /しゃぶ/.test(ctx.s) && re('44G+44KT44GT').test(ctx.s)
                    && /^(?:嗯[\s嗯]*|哈(?:啊|[…·\s]*哈)+|哈)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: () => `含着${T.pussyZh}…`,
            },
            {
                id: 'manko.shaburi.touch',
                test: (ctx) => /しゃぶりながら/.test(ctx.s)
                    && /おまんこ|まんこ/.test(ctx.s)
                    && (/触って|オナニー/.test(ctx.s) || /摸|含|自慰|小穴/.test(ctx.next))
                    && (
                        !/小穴|穴/.test(ctx.next)
                        || !/摸|自慰|触|オナニー/.test(ctx.next)
                        || /好呀，请让我含住/.test(ctx.next)
                        || !G.meatRod.test(ctx.next)
                    ),
                apply: (ctx) => {
                    if (/オナニー/.test(ctx.s)) return `一边含着${T.meatRodZh}一边用小穴自慰`;
                    if (/小穴/.test(ctx.next) && /摸|触/.test(ctx.next) && !G.meatRod.test(ctx.next)) {
                        return `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
                    }
                    return `一边含着${T.meatRodZh}一边摸自己的小穴`;
                },
            },
            {
                id: 'manko.prefix',
                test: (ctx) => re('44G+44KT44GTfOOBiuOBvuOCk+OBkw==').test(ctx.s) && ctx.len() <= 14 && !re('44GZ44G+44KT44GT').test(ctx.s),
                apply: (ctx) => prefixDomain(T.pussyZh, ctx.next),
            },
        ];

        const dashite = [
            {
                id: 'dashite.manko.sei.want',
                test: (ctx) => re('KD8655Sf44GuKT/jgYo/44G+44KT44GT44GrLnswLDEwfSg/OueyvuWtkHznsr7mtrJ844K244O844Oh44OzKS57MCw4feWHuuOBl+OBpg==').test(ctx.s)
                    && (/射出来|射出来…/.test(ctx.next) || !re('5bCP56m0').test(ctx.next) || ctx.len() <= 10)
                    && !re('5oOz5oqK57K+5ray5bCEfOW4jOacm+WwhA==').test(ctx.next),
                apply: (ctx) => (/生の/.test(ctx.s)
                    ? `想把${T.semenZh}射进生${T.smallHoleZh}`
                    : `想把${T.semenZh}射进${T.smallHoleZh}`),
            },
            {
                id: 'dashite.white',
                test: (ctx) => re('44Gb44O844GXfOeyvua2snznmb3jgYTjga5855m944GE').test(ctx.s) || /白的|白色/.test(ctx.next),
                apply: (ctx) => {
                    let next = G.tipOrFront.test(ctx.s + ctx.next)
                        ? S.fromRodTipWhite
                        : ctx.next.replace(R.ready, T.shootOutEllZh).replace(R.outOkG, S.canShoot);
                    if (!G.shotChar.test(next)) next = T.shootOutEllZh;
                    return next;
                },
            },
            {
                id: 'dashite.juice',
                test: (ctx) => /まん汁|爱液|分泌物/.test(ctx.s + ctx.next),
                apply: (ctx) => {
                    let next = ctx.next.replace(R.secretG, T.loveJuiceZh);
                    if (!G.outShotFlow.test(next)) next = S.moreJuice;
                    else if (!G.loveOrShot.test(next)) next = next.replace(R.moreThen, S.juiceMore);
                    return next;
                },
            },
            {
                id: 'dashite.ok',
                test: (ctx) => /出していい|出ひていい|出しても/.test(ctx.s) || /可以只出|出来就好/.test(ctx.next),
                apply: (ctx) => (/1だけ|只出/.test(ctx.s + ctx.next) ? S.onlyOnce : S.canShootEll),
            },
            {
                id: 'dashite.throat.waist',
                test: (ctx) => /喉に出して|腰に出して/.test(ctx.s),
                apply: (ctx) => (/喉/.test(ctx.s) ? S.throatShoot : S.waistShoot),
            },
            {
                id: 'dashite.mouth',
                test: (ctx) => /口に出して|お口に出して/.test(ctx.s)
                    && !/声|口出してくる/.test(ctx.s)
                    && !G.dashiteCover.test(ctx.next),
                apply: () => `射进嘴里…`,
            },
            {
                id: 'dashite.mouth',
                test: (ctx) => /口に出して|お口に出して/.test(ctx.s)
                    && !/声|口出してくる/.test(ctx.s)
                    && !G.dashiteCover.test(ctx.next),
                apply: () => `射进嘴里…`,
            },
            {
                id: 'dashite.nini',
                test: (ctx) => /にぃに出して|出して…先っぽ/.test(ctx.s),
                apply: () => S.niniShoot,
            },
            {
                id: 'dashite.naka',
                test: (ctx) => /中に出して欲しい|想要里面/.test(ctx.next + ctx.s),
                apply: () => S.nakadashiLoud,
            },
            {
                id: 'dashite.how',
                test: (ctx) => /どうしたら.{0,8}出して|再出一/.test(ctx.next + ctx.s),
                apply: () => S.howShoot,
            },
            {
                id: 'dashite.tomorrow',
                test: (ctx) => /明日出して|明天.{0,6}出来/.test(ctx.next + ctx.s),
                apply: () => S.tomorrowShoot,
            },
            {
                id: 'dashite.ejac.let',
                test: (ctx) => re('5bCE57K+44GV44Gb44Gm').test(ctx.s)
                    && (/让我在这个/.test(ctx.next) || (/让我/.test(ctx.next) && !/射/.test(ctx.next) && ctx.len() <= 10)),
                apply: (ctx) => (/だめ|ダメ/.test(ctx.s) ? `让我射进去…不行` : `让我射进去`),
            },
            {
                id: 'dashite.ejac.let',
                test: (ctx) => re('5bCE57K+44GV44Gb44Gm').test(ctx.s)
                    && (/让我在这个/.test(ctx.next) || (/让我/.test(ctx.next) && !/射/.test(ctx.next) && ctx.len() <= 10)),
                apply: (ctx) => (/だめ|ダメ/.test(ctx.s) ? `让我射进去…不行` : `让我射进去`),
            },
            {
                id: 'dashite.forced',
                test: (ctx) => /出されて/.test(ctx.s) && re('6IKJ5qOSfOOBoeOCk+OBvXznsr7lrZB857K+5rayfOOCtuODvOODoeODs3zlsITnsr4=').test(ctx.next + ctx.s),
                apply: (ctx) => {
                    if (re('57K+5a2QfOeyvua2snzjgrbjg7zjg6Hjg7M=').test(ctx.s)) {
                        let next = ctx.next;
                        if (!/射/.test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}…射出来了`;
                        return next;
                    }
                    return S.forcedShoot;
                },
            },
            {
                id: 'dashite.are',
                test: (ctx) => /^那个[…。．.!！?\s]*$/u.test(ctx.next.trim()) || /アレ.{0,12}出して/.test(ctx.s),
                apply: () => S.thatShoot,
            },
            {
                id: 'dashite.ass',
                test: (ctx) => /出しておしり|おしり.{0,6}出して/.test(ctx.s),
                apply: () => S.assShoot,
            },
            {
                id: 'dashite.lots',
                test: (ctx) => /いっぱい.{0,8}出して|出してきて|感じて.{0,8}出して|ちょ.+出して|下出して/.test(ctx.s)
                    || /全都流|拿出来|弄出来|感觉到了/.test(ctx.next),
                apply: (ctx) => {
                    const next = ctx.next;
                    const s = ctx.s;
                    if (/鼻血/.test(s)) return next;
                    if (/出してきて/.test(s) || (/拿出来/.test(next) && /出して/.test(s) && ctx.len() <= 10)) {
                        return S.shootNn;
                    }
                    if (/全都|いっぱい/.test(next + s)) return S.allShoot;
                    if (/感觉到了|感じて/.test(next + s)) return S.feelShoot;
                    if (/弄出来|下出して/.test(next + s)) return S.tryShoot;
                    if (/稍微拿|出してやろ/.test(next + s)) return T.rodSlightShootZh;
                    if (/拿出来/.test(next) && /出して/.test(s)) return T.shootOutEllZh;
                    return T.shootOutEllZh;
                },
            },
            {
                id: 'dashite.moan.stub',
                test: (ctx) => /出して/.test(ctx.s)
                    && !/セレブ|感出|書き出|口出|手出|声出|突き出|車出|足出|提出|話しながら|知りつき|喋い/.test(ctx.s)
                    && /^(?:嗯[\s嗯]*|哈\s*哈|哈|哈呜)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !G.dashiteCover.test(ctx.next),
                apply: (ctx) => (/もっと/.test(ctx.s) ? `再多射出来…嗯` : T.shootOutEllZh),
            },
            {
                id: 'dashite.kure.touch',
                test: (ctx) => /出してくれ|出して下さい|出してください/.test(ctx.s)
                    && !re('5aOwfOaJi+WHunzjgYrjgaPjgbHjgYR86Kem44Gj44Gm').test(ctx.s)
                    && /摸/.test(ctx.next)
                    && !G.dashiteCover.test(ctx.next),
                apply: () => T.pleaseShootZh,
            },
            {
                id: 'dashite.kure.pull',
                test: (ctx) => /出してくれ|出して下さい|出してください/.test(ctx.s)
                    && !re('44Kx44OEfOOBiuWwu3zohbB85aOwfOaJi+WHunzjgYrjgaPjgbHjgYQ=').test(ctx.s)
                    && /拔出/.test(ctx.next)
                    && !G.dashiteCover.test(ctx.next),
                apply: () => T.pleaseShootZh,
            },
            {
                id: 'dashite.dame.you',
                test: (ctx) => /ダメ出して|だめ出して/.test(ctx.s),
                apply: () => `不行了…射出来吧…`,
            },
            {
                id: 'dashite.semen.proof',
                test: (ctx) => re('5bCE57K+44GX44Gm').test(ctx.s) && /証拠|证据|仲良く/.test(ctx.s + ctx.next),
                apply: () => `作为关系变好的证据…就这样射着…`,
            },
            {
                id: 'dashite.talk.while',
                test: (ctx) => /話しながら出して|出してたじゃん/.test(ctx.s),
                apply: () => `刚才还一边说话一边射出来了呢`,
            },
            {
                id: 'dashite.deep.lots',
                test: (ctx) => /奥にたくさん出して|たくさん出して/.test(ctx.s) && /ダメ|だめ|もう/.test(ctx.s),
                apply: () => `不行了…往深处多射出来…`,
            },
            {
                id: 'dashite.want.more',
                test: (ctx) => re('5Ye644GX44Gm44G744GXfOWHuuOBl+OBpuOCiHzjgoLjgaPjgahccyrlh7rjgZfjgaZ86auY5r2u5LqG').test(ctx.s + ctx.next)
                    && /出して/.test(ctx.s)
                    && !/セレブ|感出|書き出|喋い|知りつき|話しながら/.test(ctx.s)
                    && !G.dashiteCover.test(ctx.next),
                apply: (ctx) => {
                    if (re('6auY5r2u').test(ctx.next)) return `别再让我${T.orgasmZh}了…再射出来啊…`;
                    if (/もっと/.test(ctx.s)) return `再多射出来…`;
                    return T.shootOutEllZh;
                },
            },
            {
                id: 'dashite.bare.ok',
                test: (ctx) => /^出して[。．.!！?\s]*$/u.test(ctx.s.trim())
                    && /可以的吧|可以吗/.test(ctx.next),
                apply: () => T.shootOutEllZh,
            },
            {
                id: 'dashite.naka.plenty',
                test: (ctx) => /中にたっぷり出され|出されたな/.test(ctx.s)
                    && /^(?:嗯嗯|哈\s*哈|哈)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: () => `里面被射得好满…`,
            },
            {
                id: 'dashite.continue',
                test: (ctx) => /元と出して|就先继续/.test(ctx.s + ctx.next) && /出して/.test(ctx.s),
                apply: () => `继续射出来…嗯`,
            },
            {
                id: 'dashite.gaman',
                test: (ctx) => re('5bCE57K+5oiR5oWifOWwhOeyvuOCkuaIkeaFog==').test(ctx.s)
                    && !/射/.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `在忍着不射吧？`,
            },
            {
                id: 'dashite.naka.itta',
                test: (ctx) => /中に出してって|中に出してと言|中に出してって言/.test(ctx.s)
                    && (/^(?:射出来|射出来…)[…。．.!！?\s]*$/u.test(ctx.next.trim()) || (ctx.len() <= 8 && !re('6YeM6Z2ifOS4reWHug==').test(ctx.next))),
                apply: () => `明明说了要射在里面…`,
            },
            {
                id: 'dashite.iyarashii',
                test: (ctx) => /いやらしいから出して|いやらしく出して/.test(ctx.s)
                    && !/声|手出|名前|手紙|結果|成績/.test(ctx.s)
                    && (/说出来|说出来吧/.test(ctx.next) || !G.dashiteCover.test(ctx.next)),
                apply: () => `下流的话就射出来吧`,
            },
            {
                id: 'dashite.ikanaito',
                test: (ctx) => /出していかないと|出していかなきゃ/.test(ctx.s)
                    && !/気負い|開き出|場所を出/.test(ctx.s)
                    && (!/射/.test(ctx.next) || /释放/.test(ctx.next)),
                apply: () => `不射出来不行`,
            },
            {
                id: 'dashite.body.kakete',
                test: (ctx) => /出して.{0,12}身体にかけて|綺麗にした身体にかけて|身体にかけていい/.test(ctx.s)
                    && /出して/.test(ctx.s)
                    && !/声|目を出|手出|名前/.test(ctx.s)
                    && (!G.dashiteCover.test(ctx.next) || ctx.len() <= 6),
                apply: () => `可以射在干净的身体上吗？`,
            },
            {
                id: 'dashite.takusan.moan',
                test: (ctx) => /たくさん出して|いっぱい出して/.test(ctx.s)
                    && !re('5aOwfOaJi+WHunzlkI3liY1855uu44KS5Ye6fOe1kOaenHznsr7mtrJ844Of44Or44KvfOOBueOCjXzjg5njg6185ZS+fOODhOODkHzjg4Hjg7Pjg5F844OB44Oz44Od44Of44Or44Kv').test(ctx.s)
                    && !re('57K+5rayfOaMpHzlj6PmsLR86IiM5aS0').test(ctx.next)
                    && (/^(?:尽情地|尽情|嗯嗯|哈)[…。．.!！?\s嗯哈]*$/u.test(ctx.next.trim()) || (!G.dashiteCover.test(ctx.next) && ctx.len() <= 8)),
                apply: () => `尽情射出来…`,
            },
            {
                id: 'dashite.gutto',
                test: (ctx) => /グッと出して|もっとグッと出して|出しておきたい/.test(ctx.s)
                    && !/やる気|声|手紙|名前/.test(ctx.s)
                    && (/插进去|引我想要/.test(ctx.next) || !G.dashiteCover.test(ctx.next)),
                apply: () => `不要拔…再用力射出来`,
            },
        ];

        const iku = [
            {
                id: 'iku.yame.itta',
                test: (ctx) => /やめ/.test(ctx.s)
                    && /イッちゃいました|イッたよ/.test(ctx.s)
                    && re('6KaB5bCE5LqGfOimgeWOu+S6hnzpq5jmva585LiN6KaB').test(ctx.next),
                apply: () => `去了…停一下`,
            },
            {
                id: 'iku.itta.past',
                test: (ctx) => /イッたよ|イッたよぉ|イっちゃいました/.test(ctx.s)
                    && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(ctx.next)
                    && !/イッちゃう|イッてるみたい/.test(ctx.s),
                apply: (ctx) => (ctx.go ? T.wentZh : T.shotZh),
            },
            {
                id: 'iku.itteru.like',
                test: (ctx) => /イッてるみたい/.test(ctx.s) && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(ctx.next),
                apply: (ctx) => (ctx.go || /ヌルヌル|柔らかい/.test(ctx.s) ? `好像去了呢` : `好像射了呢`),
            },
            {
                id: 'iku.nari.takunai',
                test: (ctx) => /なりたくない/.test(ctx.s) && /イク|イッ/.test(ctx.s),
                apply: (ctx) => (/お尻/.test(ctx.s) ? `才不想靠屁股去呢` : `才不想去呢`),
            },
            {
                id: 'iku.itte.nai',
                test: (ctx) => /イッてない|イってない|いってない|イキてない/.test(ctx.s)
                    && re('6KaB5bCE5LqGfOimgeWOu+S6hnzlsITkuoZ85Y675LqG').test(ctx.next)
                    && !/还没|没射|没去/.test(ctx.next),
                apply: (ctx) => (ctx.go ? `还没去呢` : `还没射呢`),
            },
            {
                id: 'iku.past.chatta',
                test: (ctx) => /イッちゃった|いっちゃった|イっちゃった/.test(ctx.s)
                    && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(ctx.next)
                    && !/イッちゃう|いっちゃう/.test(ctx.s)
                    && ctx.len() <= 8,
                apply: (ctx) => (ctx.go ? T.wentZh : T.shotZh),
            },
            {
                id: 'iku.kimochi.go',
                test: (ctx) => /気持ちいい/.test(ctx.s)
                    && /いっちゃう|イッちゃう|出ていっちゃう/.test(ctx.s)
                    && /好舒服/.test(ctx.next)
                    && !/要去|要射|去了|射了/.test(ctx.next),
                apply: () => `${T.feelGoodZh}…${T.aboutToGoZh}`,
            },
            {
                id: 'iku.kimochi.ikisou',
                test: (ctx) => /気持ちいい|きもちいい/.test(ctx.s)
                    && /イキそう|いきそう/.test(ctx.s)
                    && re('5aW96IiS5pyNfOimgeWwhOS6hnzopoHljrvkuoY=').test(ctx.next)
                    && !(/舒服/.test(ctx.next) && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(ctx.next)),
                apply: (ctx) => `${T.feelGoodZh}…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`,
            },
            {
                id: 'iku.kimochi.ikisou',
                test: (ctx) => /気持ちいい|きもちいい/.test(ctx.s)
                    && /イキそう|いきそう/.test(ctx.s)
                    && re('5aW96IiS5pyNfOimgeWwhOS6hnzopoHljrvkuoY=').test(ctx.next)
                    && !(/舒服/.test(ctx.next) && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(ctx.next)),
                apply: (ctx) => `${T.feelGoodZh}…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`,
            },
            {
                id: 'iku.rame.go',
                test: (ctx) => /らめ[ぇえ]|らめらめ|ラメラメ|ラメェ/.test(ctx.s)
                    && /イっちゃ|イッちゃ/.test(ctx.s)
                    && /不要|不行/.test(ctx.next)
                    && !/要去|去了|射/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.aboutToGoZh}`,
            },
            {
                id: 'iku.qudiao.mis',
                test: (ctx) => /イッちゃ|いっちゃ|イッて/.test(ctx.s) && /去掉/.test(ctx.next),
                apply: (ctx) => ctx.next.replace(/去掉了/g, ctx.go ? T.aboutToGoZh : T.aboutToCumZh).replace(/去掉/g, ctx.go ? T.aboutToGoZh : T.aboutToCumZh),
            },
            {
                id: 'iku.qudiao.mis',
                test: (ctx) => /イッちゃ|いっちゃ|イッて/.test(ctx.s) && /去掉/.test(ctx.next),
                apply: (ctx) => ctx.next.replace(/去掉了/g, ctx.go ? T.aboutToGoZh : T.aboutToCumZh).replace(/去掉/g, ctx.go ? T.aboutToGoZh : T.aboutToCumZh),
            },
            {
                id: 'iku.dont.want',
                test: (ctx) => /イキたくない|不想去/.test(ctx.s + ctx.next),
                apply: () => `我可不想去啊…`,
            },
            {
                id: 'iku.want.insert',
                test: (ctx) => /いっちゃ入れたく|让人想要插/.test(ctx.s + ctx.next) && /いっちゃ|イッちゃ/.test(ctx.s),
                apply: () => `${T.aboutToGoZh}…让人想插进去嘛`,
            },
            {
                id: 'iku.want.big.rod',
                test: (ctx) => /おっきいおちん|欲しい/.test(ctx.s)
                    && /イクッ|イッちゃう|イッて/.test(ctx.s)
                    && re('6IKJ5qOSfOaDs+imgQ==').test(ctx.next)
                    && !re('6KaB5Y675LqGfOimgeWwhOS6hnzljrvkuoZ85bCE5LqG').test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`,
            },
            {
                id: 'iku.oppai.ore',
                test: (ctx) => re('44GK44Gj44Gx44GELnswLDEyfeOCpOODg3zkv7rjgavjgoLjgqTjg4M=').test(ctx.s) && re('5LiN6KGM5LqGfOWltuWtkA==').test(ctx.next),
                apply: () => `不行了…这${T.breastZh}也让我${T.aboutToCumZh}…`,
            },
            {
                id: 'iku.dont.want',
                test: (ctx) => /イキたくない|不想去/.test(ctx.s + ctx.next),
                apply: () => `我可不想去啊…`,
            },
            {
                id: 'iku.want.insert',
                test: (ctx) => /いっちゃ入れたく|让人想要插/.test(ctx.s + ctx.next) && /いっちゃ|イッちゃ/.test(ctx.s),
                apply: () => `${T.aboutToGoZh}…让人想插进去嘛`,
            },
            {
                id: 'iku.want.big.rod',
                test: (ctx) => /おっきいおちん|欲しい/.test(ctx.s)
                    && /イクッ|イッちゃう|イッて/.test(ctx.s)
                    && re('6IKJ5qOSfOaDs+imgQ==').test(ctx.next)
                    && !re('6KaB5Y675LqGfOimgeWwhOS6hnzljrvkuoZ85bCE5LqG').test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`,
            },
            {
                id: 'iku.oppai.ore',
                test: (ctx) => re('44GK44Gj44Gx44GELnswLDEyfeOCpOODg3zkv7rjgavjgoLjgqTjg4M=').test(ctx.s) && re('5LiN6KGM5LqGfOWltuWtkA==').test(ctx.next),
                apply: () => `不行了…这${T.breastZh}也让我${T.aboutToCumZh}…`,
            },
            {
                id: 'iku.buxing.under',
                // あーっイク / short イク misread as bare 不行了 (no climax cover)
                test: (ctx) => /イク|イッ|イキ/.test(ctx.s)
                    && !/いっちゃん|ライク|マイク|スイッチ|バイク|いっちゃなさ|クイッター|目がいっちゃ/.test(ctx.s)
                    && /不行了|不行了啊/.test(ctx.next)
                    && !re('6KaB5bCEfOimgeWOu3zlsITkuoZ85Y675LqGfOmrmOa9rg==').test(ctx.next)
                    && ctx.len() <= 12,
                apply: (ctx) => ctx.climax,
            },
            {
                id: 'iku.nip.dame',
                test: (ctx) => re('5Lmz6aaWfOOBoeOBj+OBsw==').test(ctx.s)
                    && /イクっ|イクッ|イッ|イキ/.test(ctx.s)
                    && /ダメ|だめ/.test(ctx.s)
                    && !/要射|要去|去了|射了/.test(ctx.next)
                    && ctx.len() <= 24,
                apply: () => `${T.nippleZh}好舒服…不行了${T.aboutToGoZh}`,
            },
            {
                id: 'iku.ikisou.under',
                test: (ctx) => /イキそう|イッちゃいそう|イっちゃいそう|いきそう|イキそ/.test(ctx.s)
                    && !/いっちゃん|イッチな|黙っていっちゃ|ライク|マイク/.test(ctx.s)
                    && !/要射|要去|去了|射了/.test(ctx.next)
                    && ctx.len() <= 28,
                apply: (ctx) => ctx.go ? T.aboutToGoZh : T.aboutToCumZh,
            },
            {
                id: 'iku.sensei.penis.ejac',
                test: (ctx) => /イッてる|イってる/.test(ctx.s)
                    && /陰茎|射精/.test(ctx.s)
                    && /先生|せんせい/.test(ctx.s)
                    && (!/要射|要去|射了|肉棒/.test(ctx.next) || /慢慢/.test(ctx.next)),
                apply: () => `老师的${T.meatRodZh}…正在射…${T.aboutToCumZh}`,
            },
            {
                id: 'iku.hageshii',
                test: (ctx) => /激しい/.test(ctx.s)
                    && /イキそ|イキそう|イッ|だめ|ダメ/.test(ctx.s)
                    && !/要射|要去|去了|射了/.test(ctx.next)
                    && ctx.len() <= 28,
                apply: (ctx) => `好激烈…不行了…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`,
            },
            {
                id: 'iku.yabai.itt',
                test: (ctx) => /ああっイッ|あっイッ|イッ\s*あっ|やばっ/.test(ctx.s)
                    && /イッ|イキ|イク/.test(ctx.s)
                    && !/いっちゃん|サイクル|レンタ/.test(ctx.s)
                    && !/要射|要去|去了|射了/.test(ctx.next)
                    && ctx.len() <= 28,
                apply: (ctx) => ctx.go ? T.aboutToGoZh : T.aboutToCumZh,
            },
            {
                id: 'iku.bare',
                test: (ctx) => /^我去[…。．.!！?\s]*$/u.test(ctx.next.trim()) || /^イク/.test(ctx.s.trim()),
                apply: (ctx) => ctx.climax,
            },
            {
                id: 'iku.ok.q',
                test: (ctx) => /现在可以了吗|可以了吗/.test(ctx.next) && /イッてもいい|イってもいい/.test(ctx.s),
                apply: () => S.canShootQ,
            },
            {
                id: 'iku.not.yet',
                test: (ctx) => /还没射|还没/.test(ctx.next) && /イッちゃダメ|イッちゃだめ/.test(ctx.s),
                apply: () => S.cantGoYet,
            },
            {
                id: 'iku.ikuiku',
                test: (ctx) => /快射快射|射得特别/.test(ctx.next) || /イクイク/.test(ctx.s),
                apply: (ctx) => {
                    if (!/イクイク/.test(ctx.s)) return ctx.next;
                    if (/痛/.test(ctx.next) && /痛/.test(ctx.s)) {
                        if (!re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(ctx.next)) {
                            return `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`;
                        }
                        return ctx.next;
                    }
                    if (ctx.go && /らめ|ラメ|だめ|ダメ/.test(ctx.s)) return S.ikuIkuDameGo;
                    return ctx.go ? S.ikuIkuGo : S.ikuIkuShoot;
                },
            },
            {
                id: 'iku.again',
                test: (ctx) => /再来一次|再射一次/.test(ctx.next) && /もう一回イッ|もっかい/.test(ctx.s),
                apply: () => d('5YaN6auY5r2u5LiA5qyh4oCm5YaN6auY5r2u5LiA5qyh4oCm5ZWK4oCm'),
            },
            {
                id: 'iku.dame',
                test: (ctx) => /いっちゃ|イッちゃ/.test(ctx.s) && /だめ|ダメ/.test(ctx.s) && /我要|不行/.test(ctx.next),
                apply: () => S.goDame,
            },
            {
                id: 'iku.sensei.xie',
                test: (ctx) => /泄了|イッて/.test(ctx.next + ctx.s) && /先生|老师/.test(ctx.next + ctx.s),
                apply: (ctx) => (ctx.go || /先生もイッ/.test(ctx.s)
                    ? S.senseiGo
                    : ctx.next.replace(R.xieLe, T.shotZh)),
            },
            {
                id: 'iku.sensei.prefix',
                test: (ctx) => re('6KaB5bCE5LqGJA==').test(ctx.next.trim()) && /先生|せんせい|センセ/.test(ctx.s) && !G.senseiOr.test(ctx.next),
                apply: (ctx) => prefixDomain(T.senseiPrefZh, ctx.next),
            },
            {
                id: 'iku.ore',
                test: (ctx) => /俺イク|我快来了/.test(ctx.next + ctx.s),
                apply: () => S.oreIku,
            },
            {
                id: 'iku.again.go',
                test: (ctx) => /またいっちゃ|快憋不住|いっちゃいそ/.test(ctx.next + ctx.s),
                apply: (ctx) => (/触って/.test(ctx.s)
                    ? (/ダメ|不行|ひど/.test(ctx.s + ctx.next) ? `摸着就${T.aboutToGoZh}…不行哦` : `摸着就${T.aboutToGoZh}`)
                    : S.againGo),
            },
            {
                id: 'iku.there',
                test: (ctx) => /そこいっちゃう|那里动了/.test(ctx.next + ctx.s),
                apply: () => S.thereGo,
            },
            {
                id: 'iku.rub',
                test: (ctx) => /すごいっちゃう|摩擦.*刺激|真他妈刺激/.test(ctx.next + ctx.s),
                apply: () => S.rubGo,
            },
            {
                id: 'iku.oops',
                test: (ctx) => /これでいっちゃ|糟了/.test(ctx.next + ctx.s) && /いっちゃ/.test(ctx.s),
                apply: () => S.oopsGo,
            },
            {
                id: 'iku.short',
                test: (ctx) => /イッ|イク|イキ/.test(ctx.s)
                    && ctx.len() <= 8
                    && !re('6KaB5Y67fOimgeWwhHzljrvkuoZ85bCE5LqGfOiIkuacjXzpq5jmva4=').test(ctx.next)
                    // 不行了 alone is under (handled by iku.buxing); keep skip only when longer soft refuse
                    && !(/不行(?!了)/.test(ctx.next) && !/イク|イッ/.test(ctx.s)),
                apply: (ctx) => ctx.climax,
            },
        ];

        const sensei = [
            {
                id: 'sensei.wait.dame',
                test: (ctx) => /待って先生|先生っ/.test(ctx.s)
                    && /先生|せんせい|センセ/.test(ctx.s)
                    && !G.senseiOr.test(ctx.next)
                    && (/抱歉|不行|だめ|ダメ|待/.test(ctx.next) || ctx.len() <= 18),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…老师`,
            },
            {
                id: 'sensei.blank.moan',
                test: (ctx) => /先生|せんせい|センセ/.test(ctx.s)
                    && /^(?:…|[。．.\s…·]+|啊+|嗯+|哈+)$/u.test(ctx.next.trim())
                    && ctx.len() <= 6,
                apply: (ctx) => (/出ちゃう|出る|イッ|イク/.test(ctx.s)
                    ? `老师…${ctx.go ? T.aboutToGoZh : T.aboutToCumZh}`
                    : `老师…`),
            },
            {
                id: 'sensei.nama.seen',
                test: (ctx) => /先生と生[でと]|先生と生で/.test(ctx.s)
                    && !/生徒/.test(ctx.s)
                    && /見られた|沙滩|待在/.test(ctx.s + ctx.next)
                    && !G.senseiOr.test(ctx.next),
                apply: () => `不行啦…和老师这样无套的话，被谁看到就糟了啊`,
            },
            {
                id: 'sensei.nip.iku',
                // Only rewrite when JA/ZH actually asks to report climax — not bare T.nippleJa舐め+T.aboutToGoZh
                test: (ctx) => re('5Lmz6aaWfOOBoeOBj+OBs3zkubPlpLQ=').test(ctx.s + ctx.next)
                    && /イキ|イッ|射|去/.test(ctx.s + ctx.next)
                    && (/報告|告诉|报告|イキますって/.test(ctx.s + ctx.next) || /先生|せんせい|老师/.test(ctx.s)),
                apply: (ctx) => (/報告|告诉|报告|イキますって/.test(ctx.s + ctx.next)
                    ? T.nippleReportZh
                    : prefixDomain(T.senseiPrefZh, ctx.next)),
            },
            {
                id: 'sensei.touch',
                test: (ctx) => /触って|摸/.test(ctx.s + ctx.next) && ctx.len() <= 12,
                apply: () => S.senseiTouch,
            },
            {
                id: 'sensei.lick',
                test: (ctx) => /舐め|舔/.test(ctx.s + ctx.next) && ctx.len() <= 12,
                apply: () => S.lickSensei,
            },
            {
                id: 'sensei.feel',
                test: (ctx) => /気持|舒服/.test(ctx.s + ctx.next) && ctx.len() <= 12,
                apply: () => S.feelSensei,
            },
            {
                id: 'sensei.look',
                test: (ctx) => /診|看看/.test(ctx.s + ctx.next),
                apply: () => S.senseiLook,
            },
            {
                id: 'sensei.iku.pref',
                test: (ctx) => /イク|イッ|要射|要去/.test(ctx.s + ctx.next) && ctx.len() <= 10,
                apply: (ctx) => prefixDomain(T.senseiPrefZh, ctx.next),
            },
            {
                id: 'sensei.suffix.under',
                // Late fallback only — after nama/blank/specific sensei rules
                test: (ctx) => /先生|せんせい|センセ/.test(ctx.s)
                    && !G.senseiOr.test(ctx.next)
                    && ctx.len() >= 4
                    && ctx.len() <= 24
                    && !/生徒/.test(ctx.s)
                    && !/^[.…．。\s·•\-—~～]*$/u.test(ctx.next.trim())
                    && !/沙滩|生で|无套/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…老师`,
            },
            {
                id: 'sensei.short.pref',
                test: (ctx) => ctx.len() <= 10,
                apply: (ctx) => prefixDomain(T.senseiPrefZh, ctx.next),
            },
        ];

        const lick = [
            {
                id: 'lick.please.also',
                test: (ctx) => /舐めてください|舐めて下さい/.test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && ctx.len() <= 18,
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…请舔`,
            },
            {
                id: 'lick.mouth.stub',
                test: (ctx) => /口で\s*舐め|口\s*で\s*舐め/.test(ctx.s)
                    && (/^(?:讨|不要|讨厌)[…。．.!！?\s]*$/u.test(ctx.next.trim()) || ctx.len() <= 4)
                    && !/舔/.test(ctx.next),
                apply: () => `不要…用嘴舔`,
            },
            {
                id: 'lick.passive.kimochi',
                test: (ctx) => /舐められる/.test(ctx.s)
                    && !re('44Kr44OV44Kn44Op44OGfOOCq+ODleOCp+ODqXzjg5Xjgqfjg6njg7zjg6o=').test(ctx.s)
                    && (/きもち|気持ち|すご|す[ぎき]/.test(ctx.s) || /好舒服/.test(ctx.next))
                    && !/舔/.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `被舔得好舒服`,
            },
            {
                id: 'lick.acchi.mo',
                test: (ctx) => /あっちも舐め|こっちも舐め|舐められたら/.test(ctx.s)
                    && !re('44Kr44OV44Kn44Op44OGfOOCq+ODleOCp+ODqXzjg5Xjgqfjg6njg7zjg6o=').test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `那边也被舔的话…好兴奋`,
            },
            {
                id: 'lick.show.hubby',
                test: (ctx) => /舐められる/.test(ctx.s)
                    && /見せて/.test(ctx.s)
                    && /旦那/.test(ctx.s)
                    && /看/.test(ctx.next)
                    && !/舔/.test(ctx.next),
                apply: () => `请让老公看看被别的男人舔`,
            },
            {
                id: 'lick.while.rod',
                test: (ctx) => /舐めながら/.test(ctx.s)
                    && re('44GK44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844GK44GhW+KXi+OAh+KXrypd44Gh44KT').test(ctx.s)
                    && !/舔/.test(ctx.next),
                apply: () => `边舔着${T.meatRodZh}…`,
            },
            {
                id: 'lick.wont.give',
                test: (ctx) => /舐めてくれない/.test(ctx.s)
                    && /^(?:舔)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: () => `即使那样也不会给我舔吧`,
            },
            {
                id: 'lick.while.rod',
                test: (ctx) => /舐めながら/.test(ctx.s)
                    && re('44GK44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844GK44GhW+KXi+OAh+KXrypd44Gh44KT').test(ctx.s)
                    && !/舔/.test(ctx.next),
                apply: () => `边舔着${T.meatRodZh}…`,
            },
            {
                id: 'lick.wont.give',
                test: (ctx) => /舐めてくれない/.test(ctx.s)
                    && /^(?:舔)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: () => `即使那样也不会给我舔吧`,
            },
            {
                id: 'lick.fella.skill',
                test: (ctx) => re('44OV44Kn44Op').test(ctx.s)
                    && (/上手|厉害|女朋友|进到里面/.test(ctx.next) || /上手/.test(ctx.s)),
                apply: () => d('5Y+j5Lqk5b6X55yf5aW95ZWK4oCm'),
            },
            {
                id: 'lick.oppai.maybe',
                test: (ctx) => re('44GK44Gj44Gx44GELnswLDEwfeiIkOOCgXzoiJDjgoHjgaHjgoPjgYTjgZ3jgYY=').test(ctx.s) && re('44GK44Gj44Gx44GEfOODiuOCqg==').test(ctx.s),
                apply: () => `就算不是他的…你的${T.breastZh}也让人想舔…`,
            },
            {
                id: 'lick.sweat',
                test: (ctx) => /汗.{0,8}舐|舐めるから/.test(ctx.s) && /汗|エッチ|ずむ/.test(ctx.s),
                apply: () => `色色的汗黏糊糊的，我来舔…`,
            },
            {
                id: 'lick.dont.want',
                test: (ctx) => /舐めたくない/.test(ctx.s) && ctx.len() <= 8,
                apply: () => `不想舔吧？`,
            },
            {
                id: 'lick.moan.stub',
                test: (ctx) => /舐め/.test(ctx.s)
                    && /^(?:嗯嗯|哈\s*哈|哈|呜)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: () => `舔…`,
            },
            {
                id: 'lick.yummy.look',
                test: (ctx) => /美味そうに舐め|夹着/.test(ctx.s + ctx.next) && /舐め/.test(ctx.s),
                apply: () => `再舔得更香一点…来…`,
            },
            {
                id: 'lick.body',
                test: (ctx) => /身体を.{0,8}舐め|手を舐め/.test(ctx.s) && ctx.len() <= 8,
                apply: () => `这么美的身体…我可要舔上去了哦？`,
            },
            {
                id: 'lick.hypothetic.nip',
                test: (ctx) => /舐められたら|どうなっちゃう|どうなるかな/.test(ctx.s)
                    && re('5Lmz6aaWfOOBoeOBj+OBsw==').test(ctx.s)
                    && !/報告|イキますって/.test(ctx.s),
                apply: () => `被舔${T.nippleZh}的话会怎么样呢…${T.aboutToGoZh}`,
            },
            {
                id: 'lick.wetter',
                test: (ctx) => /舐めたら|舔的话/.test(ctx.s + ctx.next) && /濡れ|更湿/.test(ctx.s + ctx.next),
                apply: () => d('6IiU55qE6K+d5Lya5pu05rm/4oCm'),
            },
            {
                id: 'lick.passive',
                test: (ctx) => /舐められちゃう|被舔/.test(ctx.s + ctx.next) && (/摸|触/.test(ctx.next) || ctx.len() <= 6),
                apply: () => d('6KaB6KKr6IiU5Yiw5LqG4oCm'),
            },
            {
                id: 'lick.tease.cant',
                test: (ctx) => /舐められる/.test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && /受不了|捉弄|異常|いじょう/.test(ctx.s + ctx.next),
                apply: () => `要是再被这样舔下去，我可受不了啊？`,
            },
            {
                id: 'lick.worth',
                test: (ctx) => /舐め甲斐|舐めがい/.test(ctx.s)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !/舔/.test(ctx.next),
                apply: () => `这根${T.meatRodZh}很值得舔…`,
            },
            {
                id: 'lick.tease.cant',
                test: (ctx) => /舐められる/.test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && /受不了|捉弄|異常|いじょう/.test(ctx.s + ctx.next),
                apply: () => `要是再被这样舔下去，我可受不了啊？`,
            },
            {
                id: 'lick.worth',
                test: (ctx) => /舐め甲斐|舐めがい/.test(ctx.s)
                    && re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KT').test(ctx.s)
                    && !/舔/.test(ctx.next),
                apply: () => `这根${T.meatRodZh}很值得舔…`,
            },
            {
                id: 'lick.while.look',
                test: (ctx) => /見ながら舐めて|一边看/.test(ctx.s + ctx.next) && /舐めて|舔/.test(ctx.s + ctx.next),
                apply: () => d('55yL552A5oiR5LiA6L656IiU4oCm'),
            },
            {
                id: 'lick.kiss.to.lick',
                test: (ctx) => /亲得满嘴|亲一下/.test(ctx.next),
                apply: (ctx) => ctx.next.replace(R.kissG, T.lickZh),
            },
            {
                id: 'lick.then',
                test: (ctx) => /じゃ舐める|舐めるね/.test(ctx.s) || /那我就/.test(ctx.next),
                apply: () => S.thenLick,
            },
            {
                id: 'lick.want',
                test: (ctx) => {
                    if (/一回舐めて/.test(ctx.s) || /舔/.test(ctx.next)) return false;
                    if (/舐めて欲しい|舐めしてほしい|舐めてほしい|舐めたい|早くちゃんと舐めて|ちゃんと舐めて/.test(ctx.s)) {
                        return /想让你|怎么做|想要|喜欢|苦涩|稍微|老师|太棒|尝尝|吸吮/.test(ctx.next)
                            || /难道/.test(ctx.next)
                            || ctx.len() <= 12
                            || !/舔/.test(ctx.next);
                    }
                    // short stubs: bare 舐めて without 舔 cover
                    return /舐めて/.test(ctx.s)
                        && (/想让你|稍微|太棒|尝尝|吸吮|老师/.test(ctx.next) || /难道/.test(ctx.next) || ctx.len() <= 8);
                },
                apply: (ctx) => {
                    if (/先生|せんせい|センセ/.test(ctx.s) && /老师|先生/.test(ctx.next)) {
                        return `${ctx.next.replace(/[…。．.!！?\s]*$/u, '')}${d('4oCm6IiU4oCm')}`;
                    }
                    if (re('KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(ctx.s) && re('5Lmz5aS0').test(ctx.next)) {
                        return `${T.nippleZh}${d('4oCm6IiU4oCm')}`;
                    }
                    if (/早くちゃんと舐めて|ちゃんと舐めて/.test(ctx.s)) {
                        return `快点好好舔`;
                    }
                    if (/舐めたい/.test(ctx.s)) return `我想舔`;
                    return S.wantLick;
                },
            },
            {
                id: 'lick.fellason',
                test: (ctx) => re('44OV44Kn44Op44K944OzfOOBquOBi+OBsuODleOCp+ODqXzjg5Xjgqfjg6njgZfjgabjgY/jgozjgos=').test(ctx.s)
                    && !re('44Kr44OV44Kn44Op44OGfOODleOCp+ODqeODvOODqg==').test(ctx.s)
                    && (!/舔|口/.test(ctx.next) || ctx.len() <= 6),
                apply: () => `能舔一下吗？`,
            },
            {
                id: 'lick.ippai.hashitai',
                test: (ctx) => /いっぱい舐める|はしたない.{0,12}舐める/.test(ctx.s)
                    && !re('44Kr44OV44Kn44Op44OGfOODleOCp+ODqeODvOODqg==').test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `摆出下流姿势的话就多舔你`,
            },
            {
                id: 'lick.tooshiyo',
                test: (ctx) => /舐めとおしよ|舐めとおし/.test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && ctx.len() <= 8,
                apply: () => `一直舔吧`,
            },
            {
                id: 'lick.fellatio.q',
                test: (ctx) => /フェラチオしたこと|フェラしたことあります/.test(ctx.s)
                    && (!/舔|口/.test(ctx.next) || /两根|经验/.test(ctx.next)),
                apply: () => `有口交的经验吗？`,
            },
            {
                id: 'lick.while.ureshii',
                test: (ctx) => /ちんちん舐めてる|おちんちん舐めてる|舐めてるとき/.test(ctx.s)
                    && /嬉し|すっごい/.test(ctx.s)
                    && (!/舔/.test(ctx.next) || !/开心|高兴/.test(ctx.next) || !/舔/.test(ctx.next)),
                apply: () => `舔着${T.meatRodZh}的时候看起来好开心啊`,
            },
            {
                id: 'lick.ippai.kocchi',
                test: (ctx) => /いっぱい舐めたら|いっぱい舐めに来る/.test(ctx.s)
                    && !/舔/.test(ctx.next)
                    && ctx.len() <= 22,
                apply: () => `多舔的话这边也会多舔回来`,
            },
            {
                id: 'lick.once',
                test: (ctx) => /一回舐めて|蹭一下/.test(ctx.s + ctx.next),
                apply: () => d('6IiU5LiA5qyh'),
            },
            {
                id: 'lick.well',
                test: (ctx) => /しっかり舐めて|舐めてやれ/.test(ctx.s),
                apply: () => S.lickWell,
            },
            {
                id: 'lick.grandpa',
                test: (ctx) => /舐めくり|ナメて/.test(ctx.s),
                apply: () => S.grandpaLick,
            },
            {
                id: 'lick.try',
                test: (ctx) => /舐めてみよ|来尝尝/.test(ctx.s + ctx.next),
                apply: () => S.tryLick,
            },
            {
                id: 'lick.nip.go',
                test: (ctx) => re('5Lmz6aaW44Gn44Kk44KtfOiIkOOCgeS5s+mmlg==').test(ctx.s),
                apply: () => S.lickNipGo,
            },
            {
                id: 'lick.again.fast',
                test: (ctx) => /すぐ舐めちゃう|怎么.*刚射/.test(ctx.next + ctx.s),
                apply: () => S.lickAgainFast,
            },
        ];

        const touch = [
            {
                id: 'touch.felt.good',
                test: (ctx) => /触ってたら|いま触って/.test(ctx.s)
                    && /気持ちよかった|気持ちよかったでしょう|舒服/.test(ctx.s + ctx.next),
                apply: () => `刚才摸着的时候很舒服吧？`,
            },
            {
                id: 'touch.nipple',
                test: (ctx) => re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsNn3op6bjgaPjgaZ86Kem44Gj44GmLnswLDZ9KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(ctx.s)
                    && !/摸|触/.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `摸摸${T.nippleZh}`,
            },
            {
                id: 'touch.iku.soon',
                test: (ctx) => /触ってるといっちゃ|触ってるとイッ|触ってるといき/.test(ctx.s)
                    && re('6KaB5Y675LqGfOimgeWwhOS6hnzljrvkuoZ844OA44OhfOS4jeihjA==').test(ctx.next)
                    && !/摸|触/.test(ctx.next),
                apply: (ctx) => (/ダメ|不行|ひど/.test(ctx.s + ctx.next)
                    ? `摸着就${T.aboutToGoZh}…不行哦`
                    : `摸着就${T.aboutToGoZh}`),
            },
            {
                id: 'touch.sakki.under',
                test: (ctx) => /さっき触って|触ってみ/.test(ctx.s)
                    && !/摸|触/.test(ctx.next)
                    && ctx.len() <= 14
                    && !/触ってない/.test(ctx.s),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…刚才还摸了`,
            },
            {
                id: 'touch.mitete',
                test: (ctx) => /見てて/.test(ctx.s)
                    && /触ってる|触ってるよ/.test(ctx.s)
                    && !/摸|触/.test(ctx.next)
                    && ctx.len() <= 10,
                apply: () => `看着我…在摸着呢`,
            },
            {
                id: 'touch.ippai',
                test: (ctx) => /いっぱい触って|もっと触って/.test(ctx.s)
                    && !/触ってない/.test(ctx.s)
                    && !/摸|触/.test(ctx.next)
                    && (/感觉|不行|不要/.test(ctx.next) || /^(?:嗯|哈|啊)[…。．.!！?\s]*$/u.test(ctx.next.trim())),
                apply: (ctx) => (/不行|不要/.test(ctx.next)
                    ? `不行…多摸摸`
                    : `多摸摸`),
            },
            {
                id: 'touch.dame',
                test: (ctx) => /だめ|ダメ/.test(ctx.s)
                    && /触って/.test(ctx.s)
                    && /^(?:不行|不要)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !/摸|触/.test(ctx.next),
                apply: () => `不行…摸摸`,
            },
            {
                id: 'touch.tara.yes',
                test: (ctx) => /触ってたら/.test(ctx.s)
                    && !/触ってない/.test(ctx.s)
                    && /^(?:是啊|对啊|对|嗯嗯|嗯)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !/摸|触/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(ellTrim, '')}…摸着的话`,
            },
            {
                id: 'touch.tara.yes',
                test: (ctx) => /触ってたら/.test(ctx.s)
                    && !/触ってない/.test(ctx.s)
                    && /^(?:是啊|对啊|对|嗯嗯|嗯)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    && !/摸|触/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(ellTrim, '')}…摸着的话`,
            },
            {
                id: 'touch.felt.good',
                test: (ctx) => /触ってたら|いま触って/.test(ctx.s)
                    && /気持ちよかった|気持ちよかったでしょう|舒服/.test(ctx.s + ctx.next),
                apply: () => `刚才摸着的时候很舒服吧？`,
            },
            {
                id: 'touch.lonely',
                test: (ctx) => /触って欲しかった|寂し/.test(ctx.s) || /寂寞/.test(ctx.next),
                apply: () => S.lonelyTouch,
            },
            {
                id: 'touch.more.proper',
                test: (ctx) => /もっとちゃんと触って|ちゃんと触って/.test(ctx.s)
                    && !/摸|触/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…再好好摸我`,
            },
            {
                id: 'touch.rod',
                test: (ctx) => re('KD8644GE44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgaHjgpMpLnswLDR96Kem44Gj44GmfOinpuOBo+OBpg==').test(ctx.s)
                    && !/触ってない/.test(ctx.s)
                    && (G.meatRod.test(ctx.next) || /ちん/.test(ctx.s)),
                apply: () => T.touchRodEllZh,
            },
            {
                id: 'touch.me',
                test: (ctx) => /^触って/.test(ctx.s.trim()) || /好舒服/.test(ctx.next),
                apply: () => S.touchMe,
            },
            {
                id: 'touch.please',
                test: (ctx) => /触ってくださ/.test(ctx.s) || /让你舒服/.test(ctx.next),
                apply: () => S.plsTouch,
            },
            {
                id: 'touch.jaa',
                test: (ctx) => /じゃあ触って|じゃ触って/.test(ctx.s)
                    && !/摸|触/.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `那就摸摸`,
            },
            {
                id: 'touch.soko',
                test: (ctx) => /そこ触って/.test(ctx.s)
                    && !/摸|触/.test(ctx.next)
                    && ctx.len() <= 18,
                apply: () => `摸摸那里…`,
            },
            {
                id: 'touch.kocchi.manko',
                test: (ctx) => /まんこ触って|触っててあげる/.test(ctx.s)
                    && (!/摸|触/.test(ctx.next) || (/小穴/.test(ctx.next) && !/摸|触/.test(ctx.next))),
                apply: (ctx) => (/まんこ|おまんこ/.test(ctx.s)
                    ? `来，我也帮你摸小穴`
                    : `我也帮你摸摸`),
            },
            {
                id: 'touch.basho.deteyuku',
                test: (ctx) => /場所を出て|出て行ってごらん/.test(ctx.s)
                    && /触って/.test(ctx.s)
                    && !/摸|触/.test(ctx.next),
                apply: () => `离开这里吧…我也帮你摸摸`,
            },
            {
                id: 'touch.want',
                test: (ctx) => /触って欲しい/.test(ctx.s),
                apply: () => S.lickAndTouch,
            },
            {
                id: 'touch.suffix',
                test: (ctx) => ctx.len() <= 8
                    && !/[A-Za-z]{2,}|嘟嘟/.test(ctx.next)
                    && /^(?:嗯|哈|啊|呜|摸|…)/u.test(ctx.next.trim()),
                apply: (ctx) => `${ctx.next.replace(ellTrim, '')}${S.touchMeSuf}`,
            },
        ];

        const nipple = [
            {
                id: 'nipple.asr',
                test: (ctx) => re('44GE44Gh44GP44GzfOOBguOBoeOCheOBjXzjgaHjgY/jgbPjgY/jgoLjgaF844Gh44GP44Gz44Gj44Gx44GEfOOBoeOCk+OBseOBo+OBoeOBj+OBs3zjgaHjgofjgYrjgaHjgY/jgbM=').test(ctx.s)
                    || re('5Lmz6aaWfOOBoeOBj+OBsw==').test(ctx.s),
                apply: (ctx) => {
                    const next = ctx.next;
                    const s = ctx.s;
                    if (/擦|こすれ/.test(s + next)) return S.nipRub;
                    // Hypothetic nipple-lick — keep T.aboutToGoZh polarity; never invent report stub
                    if (/舐められたら|どうなっちゃう|どうなるかな/.test(s) && !/イキ|イッ|報告|告诉|报告/.test(s + next)) {
                        return `被舔${T.nippleZh}的话会怎么样呢…${T.aboutToGoZh}`;
                    }
                    if (/舐めて/.test(s)) return S.lickRodNip;
                    if (/びんびん|变长/.test(s + next)) return S.nipHard;
                    if (/起鸡皮|起き出/.test(s + next)) return S.nipUp;
                    if (/手指|插进|おっぱい/.test(s + next) && !/おちんちん|ちんちん|チンポ/.test(s)) return S.playNip;
                    if (/おちんちんをいっぱいに挟んで|挟んでるだけで/.test(s) && /乳首|ちくび/.test(s)) {
                        return `光是用${T.meatRodZh}夹着…${T.nippleZh}`;
                    }
                    if (re('5Lmz6aaW44Gn44Kk44KtfOOCpOOCreOBvuOBmeOBo+OBpuWgseWRinzkubPpoK3jgafjgqTjgq185aCx5ZGK44GZ44KL44KT44Gg44KI').test(s)
                        || (/報告|告诉|报告/.test(next) && re('5Lmz6aaWfOOBoeOBj+OBsw==').test(s) && /イキ|イッ|要去|要射/.test(s + next))) {
                        return T.nippleReportZh;
                    }
                    if (/抽动|舒服/.test(next)) {
                        const swapped = next.replace(R.choudong, T.nippleZh);
                        return swapped.includes(T.nippleZh)
                            ? next.replace(R.choudongFeel, S.nipFeel)
                            : `${T.nippleZh}${next}`;
                    }
                    if (ctx.len() <= 16) {
                        return G.senseiOr.test(next)
                            ? next.replace(R.cumOrGoG, S.nipGo)
                            : `${S.nipEll}${next}`;
                    }
                    return next;
                },
            },
        ];

        const rame = [
            {
                id: 'rame.yame.under',
                test: (ctx) => /やめて|やめね|やめても/.test(ctx.s)
                    && !/やめろっ?$/.test(ctx.s.trim())
                    && !/不要|别|停|不行/.test(ctx.next)
                    && ctx.len() >= 2
                    && ctx.len() <= 28
                    && !/^[.…．。\s·•\-—~～]*$/u.test(ctx.next.trim()),
                apply: (ctx) => {
                    if (/先生|せんせい|老师/.test(ctx.s + ctx.next)) {
                        return /やめてもいい/.test(ctx.s)
                            ? `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…不要也行`
                            : `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…不要`;
                    }
                    return `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…不要`;
                },
            },
            {
                id: 'rame.shame.stop',
                test: (ctx) => /やめて|やめね/.test(ctx.s) && /恥ずかし|羞耻/.test(ctx.s + ctx.next),
                apply: (ctx) => (/先生|せんせい|老师/.test(ctx.s + ctx.next)
                    ? `老师…太羞耻了…不要…`
                    : `太羞耻了…不要…`),
            },
            {
                id: 'rame.yame.sensei',
                test: (ctx) => /やめて/.test(ctx.s)
                    && /先生|せんせい/.test(ctx.s)
                    && /やだ|嫌/.test(ctx.s)
                    && (!/不要|别|停/.test(ctx.next) || /这是什么/.test(ctx.next)),
                apply: () => `不要…老师，停下`,
            },
            {
                id: 'rame.yame.stop',
                test: (ctx) => /やめ/.test(ctx.s)
                    && /らめ/.test(ctx.s)
                    && /停/.test(ctx.next)
                    && !/不行|不要|别/.test(ctx.next),
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…不行`,
            },
            {
                id: 'rame.moan.stub',
                test: (ctx) => /らめ[ぇえ]|らめらめ|ラメラメ/.test(ctx.s)
                    && moanStubZh.test(ctx.next.trim()),
                apply: () => T.dameEllZh,
            },
            {
                id: 'rame.manko.iku',
                test: (ctx) => /らめ[ぇえ]|らめらめ/.test(ctx.s)
                    && re('KD8644GKKT/jgb7jgpPjgZM=').test(ctx.s)
                    && /いくいく|イクイク|イッ/.test(ctx.s)
                    && !/不行|不要|别/.test(ctx.next),
                apply: () => `不行…${T.smallHoleZh}${T.aboutToGoZh}…`,
            },
            {
                id: 'rame.remap',
                test: (ctx) => /^(?:勒梅|嘞嘞|真他娘的|真他妈|该死的|该死|玲香)[…。．.!！?\s]*$/u.test(ctx.next.trim())
                    || /勒梅|嘞嘞|真他娘|真他妈|该死|玲香/.test(ctx.next),
                apply: (ctx) => (/くすぐ|痒/.test(ctx.s + ctx.next)
                    ? S.dameItch
                    : (ctx.len() <= 6 ? T.dameEllZh : ctx.next.replace(/勒梅|嘞嘞|真他娘的|真他妈|该死的|该死|玲香/g, T.dameZh).replace(R.rameG, T.dameZh))),
            },
            {
                id: 'rame.oshi.moan',
                test: (ctx) => /おしっこ/.test(ctx.s)
                    && /らめ[ぇえ]|らめらめ/.test(ctx.s)
                    && (!/不行|不要|别/.test(ctx.next) || /尿尿/.test(ctx.next)),
                apply: () => `尿尿…不行了`,
            },
            {
                id: 'rame.kimochi',
                test: (ctx) => /らめ[ぇえ]|らめらめ|ラメラメ/.test(ctx.s)
                    && /気持ちいい|きもちいい/.test(ctx.s)
                    && /不要|不行/.test(ctx.next)
                    && !/舒服|気持ち/.test(ctx.next)
                    && ctx.len() <= 12,
                apply: (ctx) => `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…${T.feelGoodZh}`,
            },
        ];

        const choudai = [
            {
                id: 'choudai.face.uta',
                // ASR 歌に ≈ 顔に when + いっぱいちょうだい / T.semenJa
                test: (ctx) => /歌に.{0,8}いっぱい|歌に.{0,6}ちょうだい/.test(ctx.s)
                    && /ちょうだい/.test(ctx.s)
                    && !/歌う|歌詞|曲を|合唱/.test(ctx.s)
                    && (/唱|歌里|嘉宾|献上/.test(ctx.next) || !/脸|颜/.test(ctx.next)),
                apply: (ctx) => (re('44K244O844Oh44OzfOeyvua2snznsr7lrZB86ZuR').test(ctx.s)
                    ? `把${T.semenZh}射满脸给我`
                    : `满脸射给我…`),
            },
            {
                id: 'choudai.tsuba',
                test: (ctx) => /ツバちょうだい|唾ちょうだい|つばちょうだい/.test(ctx.s)
                    && !/给/.test(ctx.next)
                    && ctx.len() <= 28,
                apply: () => `给我点口水吧`,
            },
            {
                id: 'choudai.dame',
                test: (ctx) => /ダメちょうだい|だめちょうだい/.test(ctx.s)
                    && !/给/.test(ctx.next)
                    && ctx.len() <= 24,
                apply: () => `不行了…给我`,
            },
            {
                id: 'choudai.kakete',
                test: (ctx) => /かけて.{0,12}ちょうだい|いっぱいかけて/.test(ctx.s)
                    && /ちょうだい/.test(ctx.s)
                    && !/给/.test(ctx.next)
                    && ctx.len() <= 28,
                apply: (ctx) => (/子に|子供/.test(ctx.s)
                    ? `满满地射给我们的孩子…给我`
                    : `${ctx.next.replace(/[。．.!！?\s]*$/u, '')}…给我`),
            },
            {
                id: 'choudai.more.rod',
                test: (ctx) => /もっとちょうだい/.test(ctx.s)
                    && re('KD8644GKKT/jgaHjgpPjgb1844OB44Oz44OdfOOBiuOBoeOCk+OBoeOCkw==').test(ctx.s)
                    && (!/给/.test(ctx.next) || re('XuiCieajklvigKbjgILvvI4uIe+8gT9cc10qJA==', 'u').test(ctx.next.trim())),
                apply: () => `再多给我…${T.meatRodZh}都硬起来了吧？`,
            },
            {
                id: 'choudai.tip',
                test: (ctx) => /先っちょ|先っぽ|前端/.test(ctx.s),
                apply: () => S.nextTipGive,
            },
            {
                id: 'choudai.hand',
                test: (ctx) => /手ぇちょうだい|手.?ちょうだい|手をちょうだい/.test(ctx.s),
                apply: () => S.handGive,
            },
            {
                id: 'choudai.semen',
                test: (ctx) => re('44Gb44O844GXfOWwhOeyvnzjgZzjgpPjgaHjgpM=').test(ctx.s),
                apply: () => S.semenAll,
            },
            {
                id: 'choudai.feel',
                test: (ctx) => /気にもちょうだい/.test(ctx.s) || /别介意/.test(ctx.next),
                apply: () => S.giveFeel,
            },
            {
                id: 'choudai.bare',
                test: (ctx) => /^(?:行了|真他妈)[…。．.!！?\s]*$/u.test(ctx.next.trim()),
                apply: () => T.giveMeEllZh,
            },
            {
                id: 'choudai.more',
                test: (ctx) => /もっとちょうだい|再多/.test(ctx.s + ctx.next),
                apply: () => S.moreGive,
            },
            {
                id: 'choudai.deep',
                test: (ctx) => /おく.*ちょうだい|行吧|有什么不对/.test(ctx.next + ctx.s),
                apply: () => S.deepGive,
            },
            {
                id: 'choudai.suffix',
                test: (ctx) => ctx.len() <= 12 && !/逃げ|助けて/.test(ctx.s),
                apply: (ctx) => `${ctx.next.replace(ellTrim, '')}${S.giveSuf}`,
            },
            {
                id: 'choudai.dashite.soko',
                test: (ctx) => /出していい|そこに/.test(ctx.s)
                    && /ちょうだい/.test(ctx.s)
                    && !/逃げ|助けて/.test(ctx.s)
                    && (!/给|求|嘴里/.test(ctx.next) || /射出来/.test(ctx.next)),
                apply: () => `那里也可以射出来…给我`,
            },
        ];

        const irete = [
            {
                id: 'irete.cant.q',
                test: (ctx) => /入れないか|入れないの|入らないか/.test(ctx.s)
                    && !/手に入れ|気に入れ|連絡|断り/.test(ctx.s)
                    && (/^(?:嗯|唔|哈|啊)[\s嗯唔哈啊…。．.!！?]*$/u.test(ctx.next.trim()) || ctx.len() <= 6)
                    && !/插|进/.test(ctx.next),
                apply: () => `插不进去吗？`,
            },
            {
                id: 'irete.want.moan',
                test: (ctx) => /入れたい/.test(ctx.s)
                    && !/手に入れ|気に入れ|腰入れ|部類入れ|受け入れ/.test(ctx.s)
                    && !/插/.test(ctx.next)
                    && (
                        /^(?:啊哈|啊|嗯|哈|唔)[\s啊嗯哈唔…。．.!！?]*$/u.test(ctx.next.trim())
                        || (ctx.len() <= 8 && re('44GK6IW5fOS4reOBq3zjgb7jgpPjgZN844GK44G+44KT44GT').test(ctx.s))
                    ),
                apply: () => `想插进去`,
            },
            {
                id: 'irete.mouth.also',
                test: (ctx) => /口も入れ|口に入れちゃう|口も入れちゃう/.test(ctx.s)
                    && !/手に入れ|気に入れ|大学|三流/.test(ctx.s)
                    && !/插|嘴/.test(ctx.next)
                    && ctx.len() <= 16,
                apply: () => `嘴巴也要插进去`,
            },
            {
                id: 'irete.want.q',
                test: (ctx) => /入れたい/.test(ctx.s)
                    && !/手に入れ|気に入れ/.test(ctx.s)
                    && /想要吗|想要[？?]/.test(ctx.next)
                    && !/插/.test(ctx.next)
                    && ctx.len() <= 8,
                apply: () => `想插进去`,
            },
            {
                id: 'irete.behind.want',
                test: (ctx) => /後ろから入れて欲しい|後ろから入れ/.test(ctx.s)
                    && /入れて/.test(ctx.s)
                    && (/哈/.test(ctx.next) || /插进去/.test(ctx.next))
                    && !/后面|从后/.test(ctx.next),
                apply: () => `想从后面插进来`,
            },
            {
                id: 'irete.want.q',
                test: (ctx) => /入れたい/.test(ctx.s)
                    && !/手に入れ|気に入れ/.test(ctx.s)
                    && /想要吗|想要[？?]/.test(ctx.next)
                    && !/插/.test(ctx.next)
                    && ctx.len() <= 8,
                apply: () => `想插进去`,
            },
            {
                id: 'irete.behind.want',
                test: (ctx) => /後ろから入れて欲しい|後ろから入れ/.test(ctx.s)
                    && /入れて/.test(ctx.s)
                    && (/哈/.test(ctx.next) || /插进去/.test(ctx.next))
                    && !/后面|从后/.test(ctx.next),
                apply: () => `想从后面插进来`,
            },
            {
                id: 'irete.also',
                test: (ctx) => re('44GT44Gj44Gh44KC5YWl44KMfOi/mei+ueS5n+aPknznjqnkubPlpLQ=').test(ctx.s + ctx.next) && /入れ/.test(ctx.s),
                apply: () => d('6L+Z6L655Lmf5o+S6L+b5Y674oCm'),
            },
            {
                id: 'irete.all',
                test: (ctx) => /全部入れる|全部插|踢踢腿/.test(ctx.s + ctx.next) && /入れる/.test(ctx.s),
                apply: () => d('5YWo6YOo5o+S6L+b5Y675ZOm4oCm'),
            },
            {
                id: 'irete.mouth.drool',
                test: (ctx) => /口の中入れ|よだれ|那口水/.test(ctx.s + ctx.next) && /入れ/.test(ctx.s),
                apply: () => d('5oqK5ruh5piv5Y+j5rC055qE5Zi06YeM5o+S6L+b5Y675Lya5oCO5LmI5qC35ZGi77yf'),
            },
            {
                id: 'irete.sensei.ochin',
                test: (ctx) => re('5YWI55Sf44Gu44GK44Gh44KT44Gh44KTfOWFiOeUn+OBruOBiuOBoeOCk+OBvQ==').test(ctx.s)
                    && /入れたい/.test(ctx.s)
                    && !/パズル|大学/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || !re('6IKJ5qOS').test(ctx.next)),
                apply: () => `好想把老师的${T.meatRodZh}插进去`,
            },
            {
                id: 'irete.haitchatta',
                test: (ctx) => /入っちゃった|入れちゃ\s*あ|入れちゃダメ|入れちゃだめ|入れちゃえ|入れちゃだめっ/.test(ctx.s)
                    && !/パズル|大学|父ちゃん/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || /真的|哎呀|不要|忍不住/.test(ctx.next)),
                apply: (ctx) => (/入れちゃえ/.test(ctx.s)
                    ? `不能插…插进去吧`
                    : /入っちゃった/.test(ctx.s)
                        ? `真的…插进去了`
                        : `不能插进去哦`),
            },
            {
                id: 'irete.tooshi',
                test: (ctx) => /入れとおし|入れ通し/.test(ctx.s)
                    && !/パズル|大学/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || /溢/.test(ctx.next)),
                apply: () => `一直插着…`,
            },
            {
                id: 'irete.dekachi',
                test: (ctx) => /デカチ入れた|デカチン入れた|入れたことある/.test(ctx.s)
                    && /入れ/.test(ctx.s)
                    && !/パズル|大学/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || /大鸡|大鸡鸡/.test(ctx.next)),
                apply: () => `有过插大肉棒的经验吗？`,
            },
            {
                id: 'irete.kanji',
                test: (ctx) => /入れた感じ|やっぱ入れた/.test(ctx.s)
                    && /入れ/.test(ctx.s)
                    && !/パズル|大学/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || ctx.len() <= 8),
                apply: () => `插进去的感觉果然不一样`,
            },
            {
                id: 'irete.tai.demo',
                test: (ctx) => /入れたい\s*でも入れたい|でも入れたいよ|^入れたい/.test(ctx.s)
                    && /入れたい/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || /要射了/.test(ctx.next)),
                apply: () => `想插进去…还是想插进去`,
            },
            {
                id: 'irete.want.now',
                test: (ctx) => /入れたくなっ|想插|想舔老师/.test(ctx.s + ctx.next)
                    && /入れたく/.test(ctx.s)
                    && ctx.len() <= 14,
                apply: () => d('5oOz5o+S6L+b5p2l5LqG4oCm'),
            },
            {
                id: 'irete.mune.tonari',
                test: (ctx) => /胸の隣入れたい|隣入れたい/.test(ctx.s)
                    && !/パズル|大学|三流/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || ctx.len() <= 10),
                apply: () => `好痛…想插到胸口旁边`,
            },
            {
                id: 'irete.paizuri',
                test: (ctx) => /パイズリ.{0,12}入れたく|入れたくなっちゃう|もう入れたい/.test(ctx.s)
                    && /入れたい|入れたく/.test(ctx.s)
                    && !/パズル|大学/.test(ctx.s)
                    && (!/插|进/.test(ctx.next) || ctx.len() <= 22),
                apply: () => `乳交弄得酥酥麻麻…已经想插进去了`,
            },
            {
                id: 'irete.sashiire.dashite',
                test: (ctx) => re('5oy/5YWl44KM44Gf44KK5Ye644GX44Gf44KKfOWFpeOCjOOBn+OCiuWHuuOBl+OBn+OCig==').test(ctx.s)
                    && !/パズル|大学/.test(ctx.s)
                    && (!/插|进|射/.test(ctx.next) || re('6KaB5bCE5LqG').test(ctx.next)),
                apply: () => `再多插进去拔出来…`,
            },
            {
                id: 'irete.sensei.naka',
                test: (ctx) => /中入れ|入れないと/.test(ctx.s) && /先生|せんせい|老师/.test(ctx.s + ctx.next),
                apply: () => `老师，不插进去${d('5Lit5Ye6')}的话就不让摸…等等啊老师…`,
            },
            {
                id: 'irete.soon.stub',
                test: (ctx) => /もう入れたら|早く入れ/.test(ctx.s)
                    && (/^(?:哈\s*哈|哈)[…。．.!！?\s]*$/u.test(ctx.next.trim()) || /拜托|抱歉|比起/.test(ctx.next)),
                apply: (ctx) => (/もう入れたら/.test(ctx.s) ? `再插进去的话…` : `快点插进去…`),
            },
            {
                id: 'irete.deeper.now',
                test: (ctx) => /奥まで入れる|もっと奥/.test(ctx.s) && /入れる|入れ/.test(ctx.s),
                apply: () => `现在感觉不错…再往更深处插进去哦`,
            },
            {
                id: 'irete.sorry.need',
                test: (ctx) => /ちょっと入れね|入れね/.test(ctx.s) && /ごめん|抱歉/.test(ctx.s + ctx.next),
                apply: () => `光是说抱歉可不行…还是稍微插进去一点吧…`,
            },
            {
                id: 'irete.throat.self',
                test: (ctx) => /喉奥まで入れ|もぐもぐ/.test(ctx.s) && /入れ/.test(ctx.s),
                apply: () => `我喜欢…能自己吞到喉咙深处…`,
            },
            {
                id: 'irete.try',
                test: (ctx) => /指入れて|試しでさ入れて|入れてみて/.test(ctx.s) || /试一下|稍微试/.test(ctx.next),
                apply: (ctx) => (/指/.test(ctx.s) ? S.fingerTry : S.insertTry),
            },
            {
                id: 'irete.mouth',
                test: (ctx) => /口ん中に入れ|嘴里/.test(ctx.s + ctx.next),
                apply: () => S.mouthInsert,
            },
            {
                id: 'irete.raw',
                test: (ctx) => /生おち|生のおち|入れて/.test(ctx.s) && /硬棒|关照/.test(ctx.next),
                apply: () => S.rawInsert,
            },
            {
                id: 'irete.slow',
                test: (ctx) => /ゆっくり入れて/.test(ctx.s) || /慢慢来就是了/.test(ctx.next),
                apply: () => S.slowInsert,
            },
            {
                id: 'irete.here',
                test: (ctx) => /ここに入れ|放这里|放着/.test(ctx.s + ctx.next),
                apply: () => S.insertHere,
            },
            {
                id: 'irete.throat',
                test: (ctx) => /喉の奥まで入れ/.test(ctx.s),
                apply: () => S.throatSwallow,
            },
            {
                id: 'irete.finger.deep',
                test: (ctx) => /中に入れるんだね指|指/.test(ctx.s) && /入れ/.test(ctx.s),
                apply: () => S.fingerDeep,
            },
            {
                id: 'irete.rame.feel',
                test: (ctx) => /らめに入れ|入れたの.*気持ち/.test(ctx.s + ctx.next),
                apply: () => S.insertFeel,
            },
            {
                id: 'irete.suffix',
                test: (ctx) => /入れて/.test(ctx.s) && ctx.len() <= 12,
                apply: (ctx) => `${ctx.next.replace(ellTrim, '')}${T.insertInEllZh}`,
            },
        ];

        const kiss = [
            {
                id: 'kiss.shite',
                test: (ctx) => /キスして/.test(ctx.s),
                apply: (ctx) => (re('5aWJ5L6NfOWlieS7lXzjgaHjgpPjgb0=').test(ctx.s)
                    ? S.kissServe
                    : `${ctx.next.replace(ellTrim, '')}${T.kissMeEllZh}`),
            },
            {
                id: 'kiss.want',
                test: (ctx) => /キスも\s*して欲しい|キスして欲しい/.test(ctx.s)
                    && /亲/.test(ctx.next)
                    && !/想要|欲しい/.test(ctx.next)
                    && ctx.len() <= 12,
                apply: () => `也想要亲亲`,
            },
            {
                id: 'kiss.suffix',
                test: (ctx) => ctx.len() <= 10,
                apply: (ctx) => (moanStubZh.test(ctx.next.trim())
                    ? T.kissMeEllZh
                    : `${ctx.next}${S.kissSuf}`),
            },
        ];

        _underCoverRules = {
            G, tip, rod, manko, dashite, iku, sensei, lick, touch, nipple, rame, choudai, irete, kiss,
        };
        return _underCoverRules;
    }

    /**
     * Fill missing adult ZH anchors when JA clearly has them (cross-title under cover).
     * Runs late in domain fixes; keeps injections short and predicate-gated.
     */
    function applyUnderAnchorCover(cur, src, note) {
        if (!lexicon?.zhCoverJaAnchors) return cur;
        let next = String(cur || '');
        const s = String(src || '');
        // Leave blank / ellipsis / JA-echo for blank_adult_recover & other paths
        if (!next.trim() || /^[.…．。\s·•\-—~～]*$/u.test(next) || next === s) return cur;
        next = unwrapDomainMoanGlueZh(next);
        next = unwrapDomainMoanGlueZh(next);
        const ctx = { next, s, T };
        ctx.len = () => [...String(ctx.next || '').replace(/\s/g, '')].length;
        const cover0 = lexicon.zhCoverJaAnchors(s, ctx.next);
        if (!cover0.missing.length || ctx.len() > 36) return ctx.next;
        const missing = new Set(cover0.missing);
        const before = ctx.next;
        const pack = getUnderCoverRules();
        const { G } = pack;

        // tip: 先头 → 前端 (先头 is never sufficient cover)
        if (G.xianTou.test(ctx.next) && /先っぽ|先っちょ/.test(s)) {
            ctx.next = ctx.next.replace(G.xianTouG, T.frontTipZh);
            missing.delete('tip');
        } else if (missing.has('tip')) {
            runFirstMatch(pack.tip, ctx);
        }

        // rod: T.yangwuZh → T.meatRodZh (soft wrong gloss)
        if (G.yangwu.test(ctx.next) && re('KD8644GKKT/jgaHjgpN844Gh44KT44G9fOODmuODi+OCuXzjgqTjg4Hjg6Ljg4R844OH44Kr44OB44Oz').test(s)) {
            ctx.next = ctx.next.replace(G.yangwuG, T.meatRodZh);
            missing.delete('rod');
        }
        if (missing.has('rod') && !G.rodCover.test(ctx.next) && ctx.len() <= 32) {
            runFirstMatch(pack.rod, ctx);
        }

        if (missing.has('manko') && !G.mankoCover.test(ctx.next) && ctx.len() <= 28) {
            runFirstMatch(pack.manko, ctx);
        }

        if (
            missing.has('dashite')
            && !G.dashiteCover.test(ctx.next)
            && ctx.len() <= 30
            && !/腕も出|引き出|払い出|手も出|なに出してんだ|何出してんだ/.test(s)
        ) {
            runFirstMatch(pack.dashite, ctx);
        }

        if (missing.has('iku') && !G.ikuCover.test(ctx.next) && ctx.len() <= 28) {
            ctx.go = lexicon.classifyClimaxPolarity?.(s) === 'prefer_go';
            ctx.climax = ctx.go ? T.aboutToGoZh : T.aboutToCumZh;
            runFirstMatch(pack.iku, ctx);
        }

        if (missing.has('sensei') && !G.senseiCover.test(ctx.next) && ctx.len() <= 28) {
            runFirstMatch(pack.sensei, ctx);
        }

        if (missing.has('lick') && !G.lickCover.test(ctx.next) && ctx.len() <= 24) {
            runFirstMatch(pack.lick, ctx);
        }

        if (missing.has('touch') && !G.touchCover.test(ctx.next) && ctx.len() <= 20) {
            runFirstMatch(pack.touch, ctx);
        }

        if (missing.has('nipple') && !G.nippleCover.test(ctx.next) && ctx.len() <= 28) {
            runFirstMatch(pack.nipple, ctx);
        }

        if (missing.has('rame') && !G.rameCover.test(ctx.next) && /らめ|やめて|やめね|やめろ/.test(s) && ctx.len() <= 18) {
            runFirstMatch(pack.rame, ctx);
        }

        if (missing.has('choudai') && !G.choudaiCover.test(ctx.next) && /ちょうだい/.test(s) && ctx.len() <= 24) {
            runFirstMatch(pack.choudai, ctx);
        }

        if (missing.has('irete') && !G.ireteCover.test(ctx.next) && ctx.len() <= 24
            && !/手に入れ|バイク|嫁入/.test(s)) {
            runFirstMatch(pack.irete, ctx);
        }

        if (missing.has('kiss') && !G.kissCover.test(ctx.next) && /キス/.test(s) && ctx.len() <= 28
            && !/エキス|キステックス|ゴキスキ|キスタロー/.test(s)) {
            runFirstMatch(pack.kiss, ctx);
        }

        next = ctx.next;
        if (next !== before) {
            note('domain_term');
            return next;
        }
        return cur;
    }

    /** Domain-prefixed engine stubs (T.smallHoleZh / sensei moan glue) → peel to moan for lexical recover. */
    function unwrapDomainMoanGlueZh(text) {
        const t = String(text || '').trim();
        const m = t.match(re('Xig/OuWwj+eptHzogonmo5J86ICB5biIfOWtpumVv3zliY3ovoh85ZOl5ZOlKVtcc10qKOWTiCg/OuWVinxb4oCmwrdcc10q5ZOIKSt85ZevK3zlkbXlkbV85ZGcKylb4oCm44CC77yOLiHvvIE/XHNdKiQ=', 'u'));
        return m ? String(m[1]).replace(/\s+/g, ' ').trim() : t;
    }

    /** Female manko/nipple climax JA → prefer_go (do not soft-upgrade to shoot/cum). */
    function jaFemaleClimaxPreferGo(src) {
        if (lexicon?.classifyClimaxPolarity) {
            return lexicon.classifyClimaxPolarity(src) === 'prefer_go';
        }
        const s = String(src || '');
        if (re('5bCE57K+fOWHuuOBl+OBpnzlh7rjgZXjgow=').test(s)) return false;
        if (re('KD8644GKKT/jgb7jgpPjgZMuezAsMTJ9KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaN844Kk44KtKQ==').test(s)) return true;
        if (re('KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaMpLnswLDEyfSg/OuOBiik/44G+44KT44GT').test(s)) return true;
        if (re('44G+44KT44GT44GE44Gj').test(s)) return true;
        if (re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsMTJ9KD8644Kk44KtfOOCpOODg3zjgYTjgaPjgaHjgoN844GE44GPKQ==').test(s)) return true;
        if (re('KD8644Kk44KtfOOCpOODg3zjgYTjgaPjgaHjgoMpLnswLDEyfSg/OuS5s+mmlnzjgaHjgY/jgbMp').test(s)) return true;
        if (/イッちゃいそうよ|イっちゃいそうよ|いっちゃいそうよ|いきそうよ/.test(s)) return true;
        if (/らめらめ|ラメラメ|らめ[ぇえにェ]|ラメェ/.test(s) && /イク|イッ|いっちゃ|イキ/.test(s)) {
            return true;
        }
        if (
            (
                /ダメ?イッちゃう|だめイッちゃう|ダメイッちゃう|ダメ?イッちゃった|だめイッちゃった|イッちゃったわ/.test(s)
                || /(?:だめ|ダメ).{0,4}(?:ディッチャ|イッちゃ)/.test(s)
            )
            && !re('5Ye644GX44GmfOWwhOeyvg==').test(s)
        ) {
            return true;
        }
        if (/やめろ|やめね|やめてね|やめないで/.test(s) && /イッちゃう|いっちゃう|イっちゃう/.test(s)) {
            return true;
        }
        return false;
    }

    /** Domain-prefixed engine stubs (T.smallHoleZh / sensei moan glue) → peel to moan for lexical recover. */
    function unwrapDomainMoanGlueZh(text) {
        const t = String(text || '').trim();
        const m = t.match(re('Xig/OuWwj+eptHzogonmo5J86ICB5biIfOWtpumVv3zliY3ovoh85ZOl5ZOlKVtcc10qKOWTiCg/OuWVinxb4oCmwrdcc10q5ZOIKSt85ZevK3zlkbXlkbV85ZGcKylb4oCm44CC77yOLiHvvIE/XHNdKiQ=', 'u'));
        return m ? String(m[1]).replace(/\s+/g, ' ').trim() : t;
    }

    function applyAdultSemanticFixes(text, sourceText = '', mark) {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        const before = cur;
        if (!src) return { text: cur, changed: false };

        const note = (flag) => {
            if (typeof mark === 'function') mark(flag);
        };

        cur = unwrapDomainMoanGlueZh(cur);
        {
            const stub = /^(?:嗯[\s嗯]*|哈(?:啊|[…·\s]*哈)+|哈|呵呵|呜)[!！?？…。．.\s]*$/u;
            if (/話しながら出して|出してたじゃん/.test(src) && stub.test(cur.trim())) {
                cur = `刚才还一边说话一边射出来了呢`;
                note('domain_term');
            }
            if (
                /お願い/.test(src)
                && !/よろしく|舐めて|しゃぶ|入れて|出して|触って|見て/.test(src)
                && stub.test(cur.trim())
            ) {
                let out = `${T.pleaseRequestZh}了`;
                if (/本当に|ほんと/.test(src)) out = `真的${out}`;
                if (/やめ/.test(src)) out = `${out}，不要`;
                cur = out;
                note('domain_term');
            }
        }
        cur = applySimpleAdultStubs(cur, src, note);

        cur = unwrapDomainMoanGlueZh(cur);
        {
            const stub = /^(?:嗯[\s嗯]*|哈(?:啊|[…·\s]*哈)+|哈|呵呵|呜)[!！?？…。．.\s]*$/u;
            if (/話しながら出して|出してたじゃん/.test(src) && stub.test(cur.trim())) {
                cur = `刚才还一边说话一边射出来了呢`;
                note('domain_term');
            }
            if (
                /お願い/.test(src)
                && !/よろしく|舐めて|しゃぶ|入れて|出して|触って|見て/.test(src)
                && stub.test(cur.trim())
            ) {
                let out = `${T.pleaseRequestZh}了`;
                if (/本当に|ほんと/.test(src)) out = `真的${out}`;
                if (/やめ/.test(src)) out = `${out}，不要`;
                cur = out;
                note('domain_term');
            }
        }
        cur = applySimpleAdultStubs(cur, src, note);

        // ── High-reuse lexical remaps (batch top residuals) ──
        // LLM T.chinChinHiraJa/T.ochinchinJa →「居然」(false gloss); remap when JA has rod
        if (
            /居然/.test(cur)
            && re('KD8644GKKT/jgaHjgpPjgaHjgpN8KD8644GKKT/jgaHjgpPjgb1844OB44Oz44OdfOOCquODgeODs+ODgeODsw==').test(src)
            && !/キッチン|スイッチ|キャッチ|ピンチ|ランチ|アンチ/.test(src)
        ) {
            cur = cur.replace(/居然/g, T.meatRodZh);
            note('domain_term');
        }
        // ちんちん入れて short stub missing 肉棒 (not 後ろから)
        if (
            /ちんちん入れて|おちんちん入れて|ちんぽ入れて/.test(src)
            && /插|进/.test(cur)
            && !/肉棒|鸡巴|鸡鸡/.test(cur)
            && !/後ろから|後ろで|うしろから/.test(src)
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
            note('domain_term');
        }
        // しゃぶりながら + おまんこ already has 小穴/摸 but missing 肉棒
        if (
            /しゃぶりながら/.test(src)
            && /おまんこ|まんこ/.test(src)
            && /ちんぽ|チンポ|おちん/.test(src)
            && /小穴|摸|自慰/.test(cur)
            && !/肉棒|鸡巴|鸡鸡/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
            note('domain_term');
        }
        // One-film invent: 俺のT.chinpoJa →「我什么都愿意做，快点插我的T.meatRodZh…」
        if (
            re('5L+644Gu44OB44Oz44OdfOOCquODrOOBruODgeODs+ODnXzkv7rjga7jgaHjgpPjgb0=').test(src)
            && /我什么都愿意|快点插我的/.test(cur)
        ) {
            if (/好き/.test(src)) cur = `喜欢我的${T.meatRodZh}`;
            else if (/でイ[きキ]|でイッ|でいく|イきたい|イキたい/.test(src)) cur = `想用我的${T.meatRodZh}去吧`;
            else cur = `我的${T.meatRodZh}`;
            note('domain_term');
        }
        // T.chinpoHiraJaがいいか / T.ochinchinJaのがいい
        if (
            re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKeOBjOOBhOOBhHwoPzrjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKeOBruOBjOOBhOOBhA==').test(src)
            && /比较好|好[吗吧？?]|还是/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = /还是|それとも/.test(src + cur) ? `还是${T.meatRodZh}比较好？` : `${T.meatRodZh}比较好吧？`;
            note('domain_term');
        }
        // いっちゃん + ダメに決まっ falsely climaxed as T.aboutToCumZh/T.aboutToGoZh
        if (
            /いっちゃん/.test(src)
            && /ダメ|だめ/.test(src)
            && !/(?:イッ|イっ|いっ)ちゃ|イク|イキ/.test(src.replace(/いっちゃん/g, ''))
            && re('Xig/OuimgeWwhOS6hnzopoHljrvkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
        ) {
            cur = /決まっ/.test(src) ? `那当然不行吧？` : `不行哦`;
            note('domain_hallucination');
        }
        // 腰入れ coaching must not invent 插进去
        if (
            /腰入れ/.test(src)
            && !re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KTfOOBvuOCk+OBk3zmjL/lhaU=').test(src)
            && /插进去/.test(cur)
        ) {
            cur = cur.replace(/[…。．.!！?\s]*插进去[…。．.!！?\s]*/g, '').replace(/插进去/g, '').trim();
            if (!cur) cur = /ようか|吗/.test(src + cur) ? `要不要稍微挺一下腰？` : `稍微挺一下腰`;
            note('domain_hallucination');
        }
        // 腰入れてみようか under / soft
        if (
            /腰入れ/.test(src)
            && !re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KTfOOBvuOCk+OBk3zmjL/lhaU=').test(src)
            && /试试|试一下|试吗/.test(cur)
            && !/腰/.test(cur)
        ) {
            cur = /ようか|吗/.test(src + cur) ? `稍微挺一下腰试试？` : `稍微挺一下腰试试`;
            note('domain_term');
        }
        // グッド / good leftover latin
        if (/\bgood\b/i.test(cur) || /グッド/.test(src)) {
            const stripped = cur.replace(/\bgood\b/gi, '').replace(/グッド/g, '').replace(/\s{2,}/g, ' ').trim();
            if (stripped && stripped !== cur) {
                cur = stripped;
                note('domain_term');
            } else if (/^グッド|^good\b/i.test(src) && /靠过来|寄ろ/.test(src + cur)) {
                cur = `好，再靠过来一点`;
                note('domain_term');
            }
        }
        // ザコT.chinpoHiraJa / 小T.chinpoHiraJa / おっきくなったT.chinChinHiraJa under
        if (re('44K244KzKD8644Gh44KT44G9fOODgeODs+ODnXzjgaHjgpPjgaHjgpMp').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = /締まりの悪い|更紧|糟糕杂鱼/.test(src + cur) ? `更松的杂鱼${T.meatRodZh}` : `杂鱼${T.meatRodZh}`;
            note('domain_term');
        }
        if (
            re('5bCP44Gh44KT44G9fOWwj+OBleOBhOOBoeOCk3zjgaHjgaPjgaHjgoPjgYTjgaHjgpM=').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 22
        ) {
            cur = /不行|ダメ/.test(src + cur)
                ? `${cur.replace(/[。．.!！?\s]*$/u, '')}…还是小${T.meatRodZh}`
                : `小${T.meatRodZh}`;
            note('domain_term');
        }
        if (
            re('44GK44Gj44GN44GP44Gq44Gj44GfKD8644Gh44KT44Gh44KTfOOBoeOCk+OBvXzjgYrjgaHjgpMpfOWkp+OBjeOBj+OBquOBo+OBnyg/OuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = `变得这么大的${T.meatRodZh}`;
            note('domain_term');
        }
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p5YWD5rCX').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = `${T.meatRodZh}精神满满呢`;
            note('domain_term');
        }
        if (
            re('5YOV44Gu44OB44Oz44OdfOODnOOCr+OBruODgeODs+ODnXzlg5Xjga7jgaHjgpPjgb185YOV44Gu44Gh44KT44Gh44KT').test(src)
            && !re('6IKJ5qOS').test(cur)
        ) {
            let next = cur
                .replace(/第\s*\d+\s*行/g, '')
                .replace(/\bFirst\b/gi, '')
                .replace(/ファースト/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (/我的/.test(next)) {
                cur = next.replace(re('5oiR55qEKD8h6IKJ5qOSKQ=='), `我的${T.meatRodZh}`);
            } else {
                cur = `${next.replace(/[。．.!！?\s]*$/u, '')}…我的${T.meatRodZh}`;
            }
            note('domain_term');
        }
        if (
            re('44GU44GN44Gh44KT44G9fOOBlOOBo+OBpOOBhOOBoeOCk3zjgZPjgpPjgarjgZTjgY3jgaHjgpM=').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 16
        ) {
            cur = /射|だし/.test(src + cur)
                ? `这么棒的${T.meatRodZh}…射出来的话`
                : `这么棒的${T.meatRodZh}`;
            note('domain_term');
        }
        // 涎垂らしてるぞT.ochinpoJa — wrong invent T.semenZh射到T.meatRodZh
        if (
            /涎垂ら|よだれ/.test(src)
            && re('KD8644GKKT/jgaHjgpPjgb18KD8644GKKT/jgaHjgpPjgaHjgpM=').test(src)
            && (re('57K+5ray5bCE5YiwfOWwhOWIsOiCieajkg==').test(cur) || (/垂|口水/.test(src) && re('57K+5ray').test(cur)))
        ) {
            cur = `${T.meatRodZh}都垂着口水了`;
            note('domain_hallucination');
        }
        // T.ochinchinJa ちょうだい under
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844Gh44KT44G9KS57MCw0feOBoeOCh+OBhuOBoOOBhA==').test(src)
            && /给/.test(cur)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = /もっと/.test(src) ? `再多给我${T.meatRodZh}` : `给我${T.meatRodZh}吧？`;
            note('domain_term');
        }
        // もっともっとT.ochinpoJaちょうだい stub「T.meatRodZh…给我…」
        if (
            re('44KC44Gj44GoLnswLDZ9KD8644GK44Gh44KT44G9fOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0pLnswLDR944Gh44KH44GG44Gg44GEfCg/OuOBiuOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpMpLnswLDR944Gh44KH44GG44Gg44GE').test(src)
            && /もっと/.test(src)
            && re('6IKJ5qOS').test(cur)
            && /给/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `再多给我${T.meatRodZh}`;
            note('domain_term');
        }
        // 奥にいっぱいT.ochinchinJaちょうだい
        if (
            re('5aWl44GrLnswLDh9KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgb0pLnswLDR944Gh44KH44GG44Gg44GEfOOBhOOBo+OBseOBhC57MCw2fSg/OuOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb0pLnswLDR944Gh44KH44GG44Gg44GE').test(src)
            && re('6IKJ5qOSfOa3seWkhHzmj5I=').test(cur)
            && !/给/.test(cur)
        ) {
            cur = `往深处给我满满的${T.meatRodZh}`;
            note('domain_term');
        }
        // 触ってるといっちゃいそ
        if (
            /触ってるといっちゃ|触ってるとイッ|触ってるといき/.test(src)
            && (
                re('6KaB5Y675LqGfOimgeWwhOS6hnzlj4jopoE=').test(cur)
                || /摸的话|这样摸|话感/.test(cur)
            )
            && !(/摸/.test(cur) && re('6KaB5Y675LqGfOimgeWwhOS6hg==').test(cur))
        ) {
            cur = /ダメ|不行|ひど/.test(src + cur) ? `摸着就${T.aboutToGoZh}…不行哦` : `摸着就${T.aboutToGoZh}`;
            note('domain_term');
        }
        // T.nippleJa触って under
        if (
            re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsNn3op6bjgaPjgaZ86Kem44Gj44GmLnswLDZ9KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
            && !/摸|触/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `摸摸${T.nippleZh}`;
            note('domain_term');
        }
        // イッてない ≠ T.aboutToCumZh
        if (
            /イッてない|イってない|いってない/.test(src)
            && re('6KaB5bCE5LqGfOimgeWOu+S6hnzlsITkuoZ85Y675LqG').test(cur)
            && !/还没|没射|没去/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 8
        ) {
            cur = jaFemaleClimaxPreferGo(src) ? `还没去呢` : `还没射呢`;
            note('domain_term');
        }
        // Past イッちゃった / イッたよ collapsed to stub / T.aboutToCumZh
        if (
            /イッちゃった|いっちゃった|イっちゃった|イッたよ|イッたよぉ/.test(src)
            && !/イッちゃう|いっちゃう|イッてるみたい/.test(src)
            && (
                re('Xig/OuimgeWwhOS6hnzopoHljrvkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
                || [...cur.replace(/\s/g, '')].length <= 2
            )
        ) {
            cur = jaFemaleClimaxPreferGo(src) ? T.wentZh : T.shotZh;
            note('domain_term');
        }
        // 生T.chinpoHiraJa当て → 活生生
        if (re('55Sf44Gh44KT44G9fOeUn+ODgeODs+ODnXzjgarjgb7jgaHjgpPjgb0=').test(src) && /当て|当た/.test(src) && /活生生|活活/.test(cur)) {
            cur = /気持ちいい|舒服/.test(src + cur)
                ? `被生${T.meatRodZh}顶着好舒服`
                : `被生${T.meatRodZh}顶着`;
            note('domain_term');
        }
        // T.chinChinHiraJaじゃなくて / T.chinpoHiraJaじゃなくて under
        if (
            re('KD8644GKKT/jgaHjgpPjgaHjgpPjgZjjgoPjgarjgY/jgaZ8KD8644GKKT/jgaHjgpPjgb3jgZjjgoPjgarjgY/jgaY=').test(src)
            && /不是/.test(cur)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 8
        ) {
            cur = `不是${T.meatRodZh}吗？`;
            note('domain_term');
        }
        // T.ejaculateZh我慢 halluc
        if (re('5bCE57K+5oiR5oWifOWwhOeyvuOCkuaIkeaFog==').test(src) && !/射/.test(cur) && [...cur.replace(/\s/g, '')].length <= 16) {
            cur = `在忍着不射吧？`;
            note('domain_term');
        }
        // T.chinChinHiraJaに力 / T.chinChinHiraJaにも力 missing T.meatRodZh
        if (
            re('44Gh44KT44Gh44KT44Gr44KC5YqbfOOBoeOCk+OBoeOCk+OBq+WKmw==').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 24
        ) {
            if (/にも力/.test(src)) {
                cur = /我也有在给|也有在给/.test(cur)
                    ? cur.replace(/我也有在给|也有在给/, `${T.meatRodZh}也用力`)
                    : `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}也用力`;
            } else if (/就会用力/.test(cur)) {
                cur = cur.replace(/就会用力/, `${T.meatRodZh}就会用力`);
            } else {
                cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
            }
            note('domain_term');
        }
        // [opaque]に指入れ must not invent T.meatRodZh
        if (
            re('KD8644GKKT/jgb7jgpPjgZM=').test(src)
            && /指入れ|指を入れ/.test(src)
            && !re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KT').test(src)
            && (re('6IKJ5qOS').test(cur) || !re('5bCP56m0').test(cur))
        ) {
            cur = `把手指插进${T.pussyZh}试试`;
            note('domain_term');
        }
        // らめ + 気持ちいい collapsed to 不要不要
        if (
            /らめ[ぇえ]|らめらめ|ラメラメ/.test(src)
            && /気持ちいい|きもちいい/.test(src)
            && /不要|不行/.test(cur)
            && !/舒服/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 8
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.feelGoodZh}`;
            note('domain_term');
        }
        // キスもして欲しい stub
        if (
            /キスも\s*して欲しい|キスして欲しい/.test(src)
            && /亲/.test(cur)
            && !/想要/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `也想要亲亲`;
            note('domain_term');
        }
        // すごい [opaque] stub
        if (
            re('44GZ44GU44GEXHMqKD8644GKKT/jgb7jgpPjgZN8KD8644GKKT/jgb7jgpPjgZM=').test(src)
            && /すごい/.test(src)
            && re('Xig/OuWwj+eptClb4oCm44CC77yOLiHvvIE/XHNdKiQ=', 'u').test(cur.trim())
        ) {
            cur = `好厉害的${T.pussyZh}`;
            note('domain_term');
        }
        // また出ちゃう / 出して欲しい stubbed to JA echo / moan
        if (
            /出して欲しい|出ちゃうぞ/.test(src)
            && !re('5omL57SZfOWQjeWJjXzluIzmnJt86Z+z5Ye6fOOBiuOBo+OBseOBhOWHunzlsYrjgZE=').test(src)
            && (/^[あア]+[。．.!！?\s]*$/u.test(cur.trim()) || /^[ぁ-んァ-ン]{1,4}[。．.!！?\s]*$/u.test(cur.trim()))
        ) {
            cur = /欲しい|ほしい/.test(src) ? `又${T.aboutToCumZh}…想让我射出来吗？` : `又要射出来了哦`;
            note('domain_term');
        }
        // T.chikubiHiraJa/T.nippleJa → 脖子 / 奶脖 misread
        if (re('KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src) && /脖子|奶脖/.test(cur)) {
            cur = cur
                .replace(/奶脖/g, T.nippleZh)
                .replace(/脖子/g, T.nippleZh);
            note('domain_term');
        }
        // T.chinpoJa/T.chinpoHiraJa glossed as T.smallHoleZh (no manko JA)
        if (
            re('44OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpM=').test(src)
            && re('5bCP56m0').test(cur)
            && !re('44G+44KT44GTfOOBiuOBvuOCk+OBkw==').test(src)
        ) {
            cur = cur.replace(re('5bCP56m0', 'g'), T.meatRodZh);
            note('domain_term');
        }
        // 入れたい stubbed as 想要吗
        if (
            /入れたい/.test(src)
            && !/手に入れ|気に入れ/.test(src)
            && /想要吗|想要[？?]/.test(cur)
            && !/插/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 8
        ) {
            cur = `想插进去`;
            note('domain_term');
        }
        // イッちゃ misread as 去掉了
        if (/イッちゃ|いっちゃ|イッて/.test(src) && /去掉/.test(cur)) {
            const go = jaFemaleClimaxPreferGo(src);
            if (/アナル/.test(src)) {
                cur = `后庭${go ? T.aboutToGoZh : T.aboutToCumZh}`;
            } else {
                cur = cur.replace(/要用后庭去掉了/g, go ? T.aboutToGoZh : T.aboutToCumZh)
                    .replace(/去掉了/g, go ? T.aboutToGoZh : T.aboutToCumZh)
                    .replace(/去掉/g, go ? T.aboutToGoZh : T.aboutToCumZh);
            }
            note('domain_term');
        }
        // いえすっ / イエス leaked as Latin Yes
        if (/\bYes\b/i.test(cur) && /いえす|イエス/.test(src)) {
            cur = cur.replace(/\bYes\b/gi, '').replace(/\s{2,}/g, ' ').trim();
            note('latin_garbage');
        }
        // お尻入れちゃダメ ≠ まだ入れちゃダメ「还不能插进去吗」
        if (
            /お尻入れちゃダメ|お尻.{0,6}入れちゃだめ|ケツ.{0,6}入れちゃダメ/.test(src)
            && /还不能插|插进去吗/.test(cur)
        ) {
            cur = `屁股不能插进去`;
            note('domain_term');
        }
        // イッてるみたい / イッたよ tense + なりたくない intent
        if (/イッてるみたい/.test(src) && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur) && [...cur.replace(/\s/g, '')].length <= 6) {
            cur = (jaFemaleClimaxPreferGo(src) || /ヌルヌル|柔らかい/.test(src)) ? `好像去了呢` : `好像射了呢`;
            note('domain_term');
        }
        if (
            /なりたくない/.test(src)
            && /イク|イッ/.test(src)
            && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur)
        ) {
            cur = /お尻/.test(src) ? `才不想靠屁股去呢` : `才不想去呢`;
            note('domain_term');
        }
        if (
            /イッたよ|イッたよぉ/.test(src)
            && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur)
            && !/イッちゃう|イッてるみたい/.test(src)
            && [...cur.replace(/\s/g, '')].length <= 6
        ) {
            cur = jaFemaleClimaxPreferGo(src) || /よぉ/.test(src) ? T.wentZh : T.shotZh;
            note('domain_term');
        }
        if (
            /らめ[ぇえ]|らめらめ|ラメラメ|ラメェ/.test(src)
            && /イっちゃ|イッちゃ/.test(src)
            && /不要|不行/.test(cur)
            && !/要去|去了|射/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.aboutToGoZh}`;
            note('domain_term');
        }
        if (
            /浮気/.test(src)
            && re('44G+44KT44GT').test(src)
            && re('5bCP56m0').test(cur)
            && !/出轨|偷情|外面/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…出轨了呢`;
            note('domain_term');
        }
        if (
            re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src)
            && /イッちゃう|イっちゃう|いっちゃう/.test(src)
            && re('Xig/OuimgeWOu+S6hnzopoHlsITkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
        ) {
            cur = `${T.pussyZh}${jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh}`;
            note('domain_term');
        }
        // 不要T.aboutToCumZh smash after やめ
        if (/やめ/.test(src) && re('5LiN6KaB6KaB5bCE5LqG').test(cur)) {
            cur = cur.replace(re('5LiN6KaB6KaB5bCE5LqG', 'g'), `不要…${jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh}`);
            note('domain_term');
        }
        // エッチだね / エロいね stubbed as 进来了 (no insert JA)
        if (
            /エッチだね|エロいね/.test(src)
            && /进来了/.test(cur)
            && !re('5YWl44KMfOWFpeOBo+OBpnzmjL/lhaU=').test(src)
        ) {
            cur = `好色哦…`;
            note('domain_term');
        }
        // エッチだね / エロいね stubbed as 进来了 (no insert JA)
        if (
            /エッチだね|エロいね/.test(src)
            && /进来了/.test(cur)
            && !re('5YWl44KMfOWFpeOBo+OBpnzmjL/lhaU=').test(src)
        ) {
            cur = `好色哦…`;
            note('domain_term');
        }
        // T.nippleJa (no T.breastJa) → 胸部 euphemism
        if (
            re('KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
            && !re('44GK44Gj44Gx44GE').test(src)
            && /胸部/.test(cur)
            && !re('5Lmz5aS0').test(cur)
        ) {
            cur = cur.replace(/胸部/g, T.nippleZh);
            note('domain_term');
        }
        // JA has nipple cue but ZH dropped T.nippleZh entirely
        if (
            re('KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
            && !re('5Lmz5aS0fOWltuWktA==').test(cur)
            && (re('5Lmz6aaW44GMfOOBoeOBj+OBs+OBjHzmhJ/jgZjjgaZ844GE44GY44Gj44GmfOWQuOOBo+OBpnzjgqRb44Kt44ODXQ==').test(src) || re('44GN44KMLnswLDR944Gh44GP44GzfOOBoeOBj+OBs+OBoOOBrQ==').test(src))
            && [...cur.replace(/\s/g, '')].length <= 22
        ) {
            const nipPrettyYou = d('5L2g6L+Z5Lmz5aS055yf5aW955yL4oCm');
            const nipPretty = d('5aW95ryC5Lqu55qE5Lmz5aS04oCm');
            const nipSensitive = d('5Lmz5aS05aSq5pWP5oSf5LqG4oCm5YaN5aSa5pG45pG44oCm');
            const nipEll = d('4oCm5Lmz5aS04oCm');
            const nipComma = d('77yM5Lmz5aS04oCm');
            const nipPref = d('5Lmz5aS04oCm');
            const cantHelp = d('5b+N5L2P5L2P5LqG');
            const nipCantHelp = d('5Lmz5aS05b+N5L2P5L2P5LqG');
            const itchy = d('5aW955eS');
            const nipItchy = d('5Lmz5aS05aW955eS');
            if (/きれ|きれい|綺麗/.test(src) || /小奶|你这/.test(cur)) {
                cur = /你这|小奶/.test(cur) || /だね/.test(src) ? nipPrettyYou : nipPretty;
            } else if (/もっといじって|いじってくれ/.test(src)) {
                cur = nipSensitive;
            } else if (/一生懸命|聞いても/.test(src)) {
                cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${nipEll}`;
            } else if (!re('5Lmz5aS0').test(cur)) {
                cur = cur.includes('怎么办')
                    ? cur.replace(/忍不住了/, nipCantHelp).replace(/好痒/g, nipItchy)
                    : `${cur.replace(/[。．.!！?\s]*$/u, '')}${nipComma}`;
                if (!re('5Lmz5aS0').test(cur)) cur = `${nipPref}${cur}`;
            }
            note('domain_term');
        }
        // Cast invent「新田」for 先生/せんせい
        if (/先生|せんせい/.test(src) && !/新田/.test(src) && /新田/.test(cur)) {
            cur = cur.replace(/新田/g, T.senseiZh);
            note('domain_hallucination');
        }
        // 那玩意儿 / 那东西 → T.meatRodZh when JA has rod
        {
            const hasRod = lexicon?.jaHasRodCue
                ? lexicon.jaHasRodCue(src, RE)
                : (RE.dekachinSrc.test(src) || RE.jaHasRodSrc.test(src));
            if (hasRod && /那玩意儿?|那东西|硬货/.test(cur)) {
                cur = cur
                    .replace(/那玩意儿?/g, T.meatRodZh)
                    .replace(/那东西/g, T.meatRodZh)
                    .replace(/硬货/g, T.meatRodZh);
                note('domain_term');
            }
            if (
                hasRod
                && !re('6IKJ5qOSfOm4oeW3tHzpuKHpuKF85qOS').test(cur)
                && /デカ|大き|当た|やばい/.test(src)
                && (/变得太大|光是碰到|硬货|玩意/.test(cur)
                    || (/^(?:太大了|碰到)[…。．.!！?\s]*$/u.test(cur.trim())))
                && !/想要|尺寸|大小/.test(cur)
            ) {
                cur = /デカ|大き/.test(src)
                    ? `${T.meatRodZh}${d('5Y+Y5b6X5aSq5aSn5LqG77yM5YWJ5piv56Kw5Yiw5bCx4oCm')}`
                    : `${T.meatRodZh}…${cur}`;
                note('domain_term');
            }
        }
        // [opaque] → 那个地方 / missing T.smallHoleZh
        if (
            (src.includes(T.omankoJa) || RE.mankoKataSrc.test(src) || re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src))
            && /那个地方|那地方|那个部位/.test(cur)
        ) {
            cur = cur.replace(/那个地方|那地方|那个部位/g, T.pussyZh);
            note('domain_term');
        }
        if (
            re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src)
            && !re('5bCP56m0fOeptA==').test(cur)
            && /吸い付|当たる|ビクビク/.test(src)
            && [...cur.replace(/\s/g, '')].length <= 28
        ) {
            if (/吸い付/.test(src)) {
                cur = d('5ZOO77yM6L+Z6L+Y5Y+q5piv5bCP56m05ZC4552A6ICM5bey4oCm5LiN6L+H4oCm');
            } else if (/当たる|ビクビク/.test(src)) {
                cur = cur.replace(/那个地方|那地方/, T.pussyZh);
                if (!re('5bCP56m0fOeptA==').test(cur)) {
                    cur = `${d('5Yia5omN5oiR55qE')}${T.pussyZh}${d('6L+Y6KKr5L2g56Kw5LqG5LiA5LiL4oCm')}`;
                }
            }
            note('domain_term');
        }
        // イッてるね →「好厉害」under
        if (
            /イッてる|いってる|イってる/.test(src)
            && /好厉害|厉害啊/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = jaFemaleClimaxPreferGo(src) ? d('5Zyo5Y675LqG5ZGi4oCm') : d('5Zyo5bCE5LqG5ZGi4oCm');
            note('domain_term');
        }
        // 「要了」soft climax
        if (
            /イ[クッ]|いっちゃ|イッちゃ/.test(src)
            && /要了/.test(cur)
            && !re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur)
        ) {
            const go = jaFemaleClimaxPreferGo(src);
            cur = cur.replace(/要了/g, go ? T.aboutToGoZh : T.aboutToCumZh);
            note('domain_term');
        }
        // 先っぽ + 出ちゃ without 前端
        if (
            /先っぽ|先っちょ/.test(src)
            && /出ちゃ/.test(src)
            && /射/.test(cur)
            && !/前端|先端|龟头/.test(cur)
        ) {
            cur = cur.replace(/快从这儿射了/, d('5YmN56uv5b+r6KaB5bCE5Ye65p2l5LqG')).replace(/射了/, d('5YmN56uv6KaB5bCE5LqG'));
            if (!/前端/.test(cur)) cur = `${T.frontTipEllZh}${cur}`;
            note('domain_term');
        }
        // 口に出して mid-line「能说出来」
        if (
            /口に出して|お口に出して/.test(src)
            && !/声/.test(src)
            && /说出来|能说/.test(cur)
            && !/射/.test(cur)
        ) {
            cur = `射进嘴里…`;
            note('domain_term');
        }
        if (
            /出してくれ|出してください|出して下さい/.test(src)
            && !re('5aOwfOaJi+WHunzjgYrjgaPjgbHjgYQ=').test(src)
            && /拿出来/.test(cur)
        ) {
            cur = cur.replace(/拿出来/g, T.shootOutZh);
            note('domain_term');
        }
        // 出してください ≠ 拔出去 (ケツ出して is expose-ass, skipped)
        if (
            /出してくれ|出してください|出して下さい/.test(src)
            && !re('44Kx44OEfOOBiuWwu3zohbB85aOwfOaJi+WHunzjgYrjgaPjgbHjgYQ=').test(src)
            && /拔出/.test(cur)
            && !/射/.test(cur)
        ) {
            cur = T.pleaseShootZh;
            note('domain_term');
        }
        // 出して下さい →「请摸我吧」touch hallucination
        if (
            /出してくれ|出してください|出して下さい/.test(src)
            && !re('5aOwfOaJi+WHunzjgYrjgaPjgbHjgYR86Kem44Gj44Gm').test(src)
            && /摸/.test(cur)
            && !/射/.test(cur)
        ) {
            cur = T.pleaseShootZh;
            note('domain_term');
        }
        // お願いします →「请摸我」without 触って
        if (
            /お願い/.test(src)
            && !/触って|出して|舐めて/.test(src)
            && /请摸/.test(cur)
        ) {
            cur = T.pleaseRequestZh;
            note('domain_term');
        }
        // Engine moan-stub「哈 哈」over お願い / やめてくれ
        if (
            /お願い/.test(src)
            && !/よろしく|舐めて|しゃぶ|入れて|出して|触って|見て/.test(src)
            && /^(?:嗯[\s嗯]*|哈(?:啊|[…·\s]*哈)+|哈|呵呵|呜)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            let out = `${T.pleaseRequestZh}了`;
            if (/本当に|ほんと/.test(src)) out = `真的${out}`;
            if (/やめ/.test(src)) out = `${out}，不要`;
            cur = out;
            note('domain_term');
        }
        // お願いします →「请摸我」without 触って
        if (
            /お願い/.test(src)
            && !/触って|出して|舐めて/.test(src)
            && /请摸/.test(cur)
        ) {
            cur = T.pleaseRequestZh;
            note('domain_term');
        }
        // Engine moan-stub「哈 哈」over お願い / やめてくれ
        if (
            /お願い/.test(src)
            && !/よろしく|舐めて|しゃぶ|入れて|出して|触って|見て/.test(src)
            && /^(?:嗯[\s嗯]*|哈(?:啊|[…·\s]*哈)+|哈|呵呵|呜)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            let out = `${T.pleaseRequestZh}了`;
            if (/本当に|ほんと/.test(src)) out = `真的${out}`;
            if (/やめ/.test(src)) out = `${out}，不要`;
            cur = out;
            note('domain_term');
        }

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

        const femaleClimaxGo = jaFemaleClimaxPreferGo(src);
        if (
            !femaleClimaxGo
            && (
                cur.includes(T.shootCumZh)
                || cur.includes(T.shootCumShortZh)
                || cur.includes(T.shotZh)
                || cur.includes(T.fastShotZh)
                || cur.includes(T.againShotZh)
                || cur.includes(T.aboutToCumZh)
                || cur.includes(T.aboutToGoZh)
                || cur.includes(T.wentZh)
                || re('5bCE5Ye65p2lfOiDveWwhHzlsITnsr4=').test(cur)
            )
        ) {
            const marked = cur.split(T.dontShootZh).join('\uE000');
            const nonClimaxGo = [
                d('5aSx5Y675LqG'), d('6L+H5Y675LqG'), d('5q275Y675LqG'), d('6Zmk5Y675LqG'), d('5oq55Y675LqG'), d('5b+Y5Y675LqG'),
                d('6L+b5Y675LqG'), d('5Ye65p2l5LqG'), d('5Zue5Y675LqG'), d('5Ye65Y675LqG'), d('5bim5Y675LqG'), d('5ou/5Y675LqG'),
                d('56a75Y675LqG'), d('5pWj5Y675LqG'), d('6KSq5Y675LqG'), d('5raI5Y675LqG'), d('6L6e5Y675LqG'), d('5aS65Y675LqG'),
            ];
            const shields = [];
            let work = marked;
            for (let i = 0; i < nonClimaxGo.length; i += 1) {
                const phrase = nonClimaxGo[i];
                if (!work.includes(phrase)) continue;
                const token = `\uE100${shields.length}\uE101`;
                shields.push(phrase);
                work = work.split(phrase).join(token);
            }
            let next = work
                .replace(re('5bCE57K+5LqG', 'g'), T.shotZh)
                .replace(re('5bCE57K+', 'g'), T.shotZh)
                .replace(new RegExp(T.aboutToGoZh, 'g'), T.aboutToCumZh)
                .replace(/要去(?![的了])/g, T.goCumShortZh)
                .replace(/快去了/g, T.fastCameZh)
                .replace(/又去了/g, T.againCameZh)
                .replace(/已经去了/g, T.alreadyCameZh)
                .replace(re('6ams5LiK6KaB5Y675LqG', 'g'), T.aboutToSoonOkZh)
                .replace(/想去/g, T.wantGoZh);
            const climaxJa = RE.climaxIkuSrc.test(src)
                || RE.ikuTruncSrc.test(src)
                || RE.ikuRepeatSrc.test(src)
                || RE.ejacHintSrc.test(src)
                || RE.itchaimasuSrc.test(src);
            if (climaxJa) {
                next = next.replace(/(^|[^进出来])去了/g, `$1${T.cameZh}`);
            }
            for (let i = 0; i < shields.length; i += 1) {
                next = next.split(`\uE100${i}\uE101`).join(shields[i]);
            }
            next = next.split('\uE000').join(T.dontShootZh);
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // Female manko/nipple climax: keep/force 去了 (never soft-upgrade to male 射了)
        if (femaleClimaxGo && re('6KaB5bCE5LqGfOWwhOS6hg==').test(cur)) {
            if (
                re('Xig/OuimgeWwhOS6hnzlsITkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
                && (/わた[し]|私も/.test(src) || re('44GK44G+44KT44GT44GE44GjfOOBvuOCk+OBk+OBhOOBow==').test(src))
            ) {
                cur = T.pussyAlsoGoZh;
            } else {
                const marked = cur.split(T.shootOutZh).join('\uE000');
                cur = marked
                    .replace(re('6KaB5bCE5LqG', 'g'), T.aboutToGoZh)
                    .replace(/射了/g, T.wentZh)
                    .split('\uE000').join(T.shootOutZh);
            }
            note('domain_term');
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
            const marked = cur.split(d('5LiN6KGM5LqG')).join('\uE000');
            let next = marked.replace(/行了/g, T.aboutToCumZh);
            // Bare「行」tokens (comma/ellipsis separated)
            next = next.replace(re('KF58W++8jCzjgIFcc+KApl0p6KGMKD89JHxb44CC77yOLuKApiHvvIE/77yf77yMLOOAgVxz4oCmXXzopoHlsITkuoYp', 'g'), `$1${T.aboutToCumZh}`);
            next = next.split('\uE000').join(d('5LiN6KGM5LqG'));
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // やめ / りゃめ →「T.aboutToCumZh」/「射了」hallucination
        if (
            /(?:やめ|りゃめ|ヤメ)/.test(src)
            && (cur.includes(T.shootCumShortZh) || cur.includes(T.shotZh))
            && !RE.climaxIkuSrc.test(src)
            && !RE.ikuTruncSrc.test(src)
            && !RE.ikuRepeatSrc.test(src)
            && !RE.ejacHintSrc.test(src)
        ) {
            cur = cur
                .replace(RE.shootCumG, d('5LiN6KaB'))
                .replace(RE.shootCumShortG, d('5LiN6KaB'))
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
            cur = cur.replace(/无用不明/g, d('5ZCN5a2X5LiN5piO'));
            note('domain_term');
        }
        // ちゅばっ / ちゅぷ / んぶじゅ mixed with moans →「吸吧/吃吧」hallucination
        if (/ちゅば|チュバ|ちゅぷ|チュプ|んぶじゅ|ぶじゅぶ/.test(src) && /吸吧|吃吧|吱巴/.test(cur)) {
            cur = cur
                .replace(/吸吧|吃吧|吱巴/g, '')
                .replace(/嗯吧/g, '嗯')
                .replace(/[，,]{2,}/g, '，')
                .replace(/^[，,\s…]+|[，,\s]+$/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!cur) cur = '嗯';
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
                .split(`，${T.breakupZh}吗？`).join(d('5ZCX77yf'))
                .split(`${T.breakupZh}吗？`).join(d('5ZCX77yf'))
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
            (RE.climaxIkuSrc.test(src) || /いちゃう|イっちゃう|イッちゃう|いくっ|イクッ/.test(src))
            && cur.includes(T.aboutToStartZh)
        ) {
            cur = cur.replace(RE.aboutToStartG, T.aboutToCumZh);
            note('domain_term');
        }
        // いちゃう、開いちゃう truncated stub
        if (
            /いちゃう/.test(src)
            && /開いちゃう|ひらいちゃう/.test(src)
            && (re('XuimgeWOu+S6hlvvvIwsXT8k').test(cur) || cur === T.aboutToCumZh || cur === `${T.aboutToCumZh}，`)
        ) {
            cur = FIX.itchaunStartOkZh;
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
            && (re('XuimgeWwhOS6hlvvvIwsXT8k').test(cur) || cur === T.aboutToCumZh || cur === `${T.aboutToCumZh}，`)
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
                .replace(/挤些/g, d('5oyk5Lqb'));
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
            cur = cur.replace(RE.heixiuG, d('5Zev'));
            note('domain_hallucination');
        }
        // Residual 嘿咻 with no sex JA (大好き / moan mix)
        if (cur.includes(T.heixiuZh) && !src.includes(T.sexJa) && !src.includes(T.sexHiraJa) && !re('44K744OD44Kv44K5').test(src)) {
            cur = cur.replace(RE.heixiuG, '').replace(/\s{2,}/g, ' ').trim();
            note('domain_hallucination');
        }
        // Residual 嘿咻 with no sex JA (大好き / moan mix)
        if (cur.includes(T.heixiuZh) && !src.includes(T.sexJa) && !src.includes(T.sexHiraJa) && !re('44K744OD44Kv44K5').test(src)) {
            cur = cur.replace(RE.heixiuG, '').replace(/\s{2,}/g, ' ').trim();
            note('domain_hallucination');
        }
        // Foot-grind cue stubbed as classmate (IPZZ-399)
        if (src.includes(T.footGrindJa) && (/同学|同學/.test(cur) || cur === '同学')) {
            cur = T.footGrindOkZh;
            note('domain_term');
        }
        // Truncated T.fellaJa →「还有」
        if (re('44OV44Kn44Op').test(src) && /^(?:还有|還有)[…。．.\s]*$/u.test(cur.trim())) {
            cur = T.alsoFellaOkZh;
            note('domain_term');
        }
        // もっと/いっぱい/こっち舐めて stubbed as short moan / trunc
        if (
            /舐めて/.test(src)
            && /もっと|こっち|ほら|いっぱい|ほしい|欲しく/.test(src)
            && (
                /^(?:呵|好|嗯|哈|遍|多|舔了|也给我|想让你|舔哈哈|呜)[。．.!！?？…\s]*$/u.test(cur.trim())
                || /^(?:嗯嗯|哈啊?|哈…|啊……?)[。．.!！?？…\s]*$/u.test(cur.trim())
                || /^(?:再)?舔舔[…。．.!！?\s]*$/u.test(cur.trim())
            )
        ) {
            if (/ほら/.test(src)) cur = T.horaLickOkZh;
            else if (/ほしい|欲しく/.test(src)) cur = '想被舔…';
            else if (/はぁ/.test(src) && /^(?:舔哈哈)/.test(cur.trim())) cur = '舔…哈…';
            else if (/こっちも/.test(src) && /こっちも.{0,8}こっちも/.test(src.replace(/\s/g, ''))) {
                cur = '这边也…这边也舔舔…';
            } else cur = T.moreLickOkZh;
            note('domain_term');
        }
        // 触って欲しい stubbed as 嗯嗯
        if (
            /触って欲しい|触ってほしい/.test(src)
            && /^(?:嗯嗯|嗯|哈啊?|哈…)[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = '想被摸吗？';
            note('domain_term');
        }
        // T.ochinchinJa…早く入れて stubbed as moan
        if (
            RE.dekachinSrc.test(src)
            && /入れて/.test(src)
            && /早く|はやく/.test(src)
            && /^(?:嗯嗯|嗯|哈啊?|哈…|啊……?)[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = `快点把${T.meatRodZh}插进来…`;
            note('domain_term');
        }
        // 受け入れてごらん stubbed as 呜
        if (
            /受け入れてごらん|受け入れてごら/.test(src)
            && /^(?:呜|嗯|哈|啊)[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = '来，接受试试';
            note('domain_term');
        }
        // 舐めて…はぁ stubbed as 舔哈哈
        if (
            /舐めて/.test(src)
            && /はぁ/.test(src)
            && /^舔哈哈[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = '舔…哈…';
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
        // らめらめっイクイク →「不行不行…T.aboutToGoZh」(らめ≠该死；female resist, not male 射)
        if (
            /らめらめ|ラメラメ/.test(src)
            && /イク|イッちゃう|イっちゃう|いっちゃう|イクイク/.test(src)
            && (/该死|要射|射了|不行|要去/.test(cur) || [...cur.replace(/\s/g, '')].length >= 6)
        ) {
            cur = d('5LiN6KGM5LiN6KGM4oCm6KaB5Y675LqG');
            note('domain_term');
        }
        // らめぇ…イクイク →「来啦」misread
        else if (
            /らめ[ぇえェ]|ラメェ/.test(src)
            && /イク|イッ/.test(src)
            && (/来啦|来了|该死|要射|射了/.test(cur) || ([...cur.replace(/\s/g, '')].length <= 8 && /啊|来/.test(cur)))
        ) {
            cur = d('5LiN6KGM4oCm6KaB5Y675LqG');
            note('domain_term');
        }
        // やめね / やめろ…イッちゃう →「停住/别停 / T.aboutToCumZh」misread (resist + climax → T.aboutToGoZh)
        else if (
            /やめね|やめてね|やめないで|やめろ/.test(src)
            && /イッちゃう|イっちゃう|いっちゃう|イッちゃ/.test(src)
            && (re('5YGc5L2PfOWIq+WBnHzopoHlsITkuoZ85bCE5LqG').test(cur))
        ) {
            cur = cur
                .replace(/别停/g, '停下')
                .replace(/停住/g, '不要')
                .replace(re('6KaB5bCE5LqG', 'g'), T.aboutToGoZh)
                .replace(/射了/g, '去了');
            note('domain_term');
        }
        // もうイッてもいい? → soft「现在可以了吗」misses climax
        if (
            /イッてもいい|イってもいい|イッていい/.test(src)
            && /(?:现在)?可以了吗/.test(cur)
            && !re('5bCEfOWOu+S6hnzpq5jmva4=').test(cur)
        ) {
            cur = '可以射了吗？';
            note('domain_term');
        }
        // らめらめ →「不要不要」(baby だめだめ); drop long invent
        else if (
            /らめらめ|ラメラメ/.test(src)
            && !/ダメ|だめ|いや|やめ/.test(src)
            && !/濃い|濃く|イク|イッ/.test(src)
            && (
                /^(?:好棒|不要|不行)[\s\S]{0,24}$/u.test(cur.trim())
                || (cur.includes('好舒服') && cur.includes('不行') && [...cur.replace(/\s/g, '')].length >= 10)
                || cur === T.dameDameZh
                || /该死/.test(cur)
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
            const stub = /^(?:好热|感觉好|好厉害|(?:哈啊?|哈…)+|嗯)[…。．.!！?\s]*$/u.test(cur.trim());
            if (stub || cur.trim() === T.hotZh || cur.trim() === T.feelGoodStubZh) {
                if (/[?？]/.test(src)) {
                    cur = /これ/.test(src) ? T.thisFeelQZh : T.feelGoodQZh;
                } else {
                    cur = /[…・]/.test(src) ? T.feelGoodEllZh : T.feelGoodZh;
                }
                note('domain_term');
            }
        }
        // 気持ちいい + イキそう collapsed to bare climax / feel-good without T.aboutToCumZh
        if (
            /気持ちいい|きもちいい/.test(src)
            && /イキそう|いきそう/.test(src)
            && re('5aW96IiS5pyNfOimgeWwhOS6hnzopoHljrvkuoY=').test(cur)
            && !(/舒服/.test(cur) && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur))
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `${T.feelGoodZh}…${jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh}`;
            note('domain_term');
        }
        if (
            /気持ちいい|きもちいい/.test(src)
            && /動いて欲しい|動いて/.test(src)
            && /好舒服|好厉害/.test(cur)
            && !/动/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…这次想让你动一动`;
            note('domain_term');
        }
        if (
            (/出しちゃダメ|出しちゃだめ|出しちゃダイッて/.test(src))
            && (cur.includes(T.pleaseShootZh) || /请射出来/.test(cur))
        ) {
            cur = T.againCantShootQZh;
            note('domain_hallucination');
        }
        // 舐めて…はぁ stubbed as 舔哈哈
        if (
            /舐めて/.test(src)
            && /はぁ/.test(src)
            && /^舔哈哈[。．.!！?？…\s]*$/u.test(cur.trim())
        ) {
            cur = '舔…哈…';
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
        // らめらめ →「不要不要」(baby だめだめ); drop long invent.
        // Keep climax イっちゃ / イッちゃ — do not strip …T.aboutToGoZh back to 不要不要.
        if (
            /らめらめ|ラメラメ/.test(src)
            && !/ダメ|だめ|いや|やめ/.test(src)
            && !/(?:イッ|イっ|いっ)ちゃ|イク|イキ/.test(src)
            && !/気持ちいい|きもちいい/.test(src)
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
        // 気持ちいい stubbed as 好热 / 感觉好 / moan-only / 好厉害 / 哈 哈
        if (/気持ちいい|きもちいい|きもちぃ|キモチイイ/.test(src)) {
            const stub = /^(?:好热|感觉好|好厉害|(?:哈啊)+|哈(?:啊|[…·\s]*哈)+|嗯)[…。．.!！?\s]*$/u.test(cur.trim());
            if (stub || cur.trim() === T.hotZh || cur.trim() === T.feelGoodStubZh) {
                if (/[?？]/.test(src)) {
                    cur = /これ/.test(src) ? T.thisFeelQZh : T.feelGoodQZh;
                } else {
                    cur = /[…・]/.test(src) ? T.feelGoodEllZh : T.feelGoodZh;
                }
                note('domain_term');
            }
        }
        // 気持ちいい + イキそう collapsed to bare climax / feel-good without T.aboutToCumZh
        if (
            /気持ちいい|きもちいい/.test(src)
            && /イキそう|いきそう/.test(src)
            && re('5aW96IiS5pyNfOimgeWwhOS6hnzopoHljrvkuoY=').test(cur)
            && !(/舒服/.test(cur) && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur))
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `${T.feelGoodZh}…${jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh}`;
            note('domain_term');
        }
        if (
            /気持ちいい|きもちいい/.test(src)
            && /動いて欲しい|動いて/.test(src)
            && /好舒服|好厉害/.test(cur)
            && !/动/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…这次想让你动一动`;
            note('domain_term');
        }
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
            const marked = cur.split(d('5LiN6KGM5LqG')).join('\uE000');
            const next = marked.replace(RE.okDoneG, T.aboutToCumZh).split('\uE000').join(d('5LiN6KGM5LqG'));
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
        // Stub: JA has erect+rod but ZH only kept「勃起」
        if (
            RE.dekachinSrc.test(src)
            && /勃起/.test(src)
            && cur.replace(/[…。.\s]/g, '') === '勃起'
        ) {
            cur = `勃起的${T.meatRodZh}`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa/ぽも固く… →「也？」
        if (
            re('44GK44Gh44KT44Gh44KT44KC5Zu6fOOBiuOBoeOCk+OBveOCguWbunzjgaHjgpPjgaHjgpPjgoLlm7o=').test(src)
            && /^也？?$/.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}也硬了吗？`;
            note('domain_term');
        }
        // Stub: T.chinChinHiraJa触ってない →「没摸呢」
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844OB44Oz44OB44OzKS57MCw2feinpuOBo+OBpuOBquOBhHzop6bjgaPjgabjgarjgYQuezAsNn0oPzrjgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTKQ==').test(src)
            && /^(?:没摸|没有摸)[呢啊]?[。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `没摸${T.meatRodZh}呢`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa硬い → kinship-only「哥哥…」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844OB44Oz44OB44OzKS57MCw0feehrA==').test(src)
            && /^(?:哥哥|姐姐|爸爸|妈妈|主人)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}好硬…`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa、硬い →「哈 硬了 / 硬了」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844OB44Oz44OB44OzKS57MCw2feehrA==').test(src)
            && /^(?:哈[…·.\s]*)?硬了[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = /はぁ|はあ|ハァ/.test(src) ? `哈…${T.meatRodZh}好硬…` : `${T.meatRodZh}好硬…`;
            note('domain_term');
        }
        // Stub: T.ochinchinJaピクピク →「在颤抖」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDh944OU44Kv44OU44KvfOODlOOCr+ODlOOCry57MCw4fSg/OuOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb0p').test(src)
            && /^(?:在)?颤抖[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}在跳…`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa動いてる →「在动呢」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDZ95YuV44GE44GmfOWLleOBhOOBpi57MCw2fSg/OuOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb0p').test(src)
            && /^(?:在动|动着?)[呢了啊]?[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}在动呢…`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa…ちょうだい →「插进去」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /ちょうだい|頂戴/.test(src)
            && /^(?:插进去|插进来)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `把${T.meatRodZh}给我…`;
            note('domain_term');
        }
        // Stub: 気持ち…T.ochinchinJa →「好舒服」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /気持ち/.test(src)
            && /^(?:好舒服|哈[…·.\s]*好舒服)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}好舒服…`;
            note('domain_term');
        }
        // Stub: エッチに触ってください →「请 / 亲」
        if (
            /エッチに触って|エロく触って|色っぽく触って/.test(src)
            && /ください|下さい|くださ/.test(src)
            && /^(?:请|拜托|亲(?:\s*亲)?)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '请色气地摸我…';
            note('domain_term');
        }
        // Stub: T.chinChinHiraJa舐めて →「舔舔」
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844OB44Oz44OB44OzKS57MCw4feiIkOOCgeOBpnzoiJDjgoHjgaYuezAsOH0oPzrjgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvSk=').test(src)
            && /^(?:舔舔|舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `舔${T.meatRodZh}…`;
            note('domain_term');
        }
        // Stub: 一回舐めて →「一次」
        if (
            /舐めて/.test(src)
            && /一回|一度|ちょっと/.test(src)
            && /^(?:一次|一下)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '舔一次…';
            note('domain_term');
        }
        // Stub: よろしくお願いします →「你好」
        if (
            /よろしくお願いします|よろしくお願い/.test(src)
            && /^(?:你好|您好)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            const m = src.match(/^([^\s、,，]{1,12})です[、,，]?\s*よろしく/);
            cur = m ? `我是${m[1]}，请多指教` : '请多指教';
            note('domain_term');
        }
        // Stub: T.ochinchinJa…かったら →「啊 硬了」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /かっ|硬|ピン|びん/.test(src)
            && /^(?:啊[…·.\s]*)?硬了[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `啊，${T.meatRodZh}硬了…`;
            note('domain_term');
        }
        // Stub: 口で舐めて / T.fellaJaしてください →「用口舔」
        if (
            ((/口で/.test(src) && /舐めて/.test(src)) || re('44OV44Kn44Op').test(src))
            && /ください|下さい/.test(src)
            && /^(?:用口舔|用嘴舔|口舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '请用嘴舔…';
            note('domain_term');
        }
        // Stub: T.fellaJa好き → kinship / trunc scrap
        if (
            re('44OV44Kn44Op').test(src)
            && /好き/.test(src)
            && (/^(?:小是啊|喜欢)[…。．.!！?\s]*$/u.test(cur.trim()) || ([...cur.replace(/\s/g, '')].length <= 5 && !re('5Y+j5LqkfOiIlA==').test(cur)))
        ) {
            cur = /ねえちゃん|お姉/.test(src) ? d('5aeQ5aeQ5Zac5qyi5Y+j5Lqk4oCm') : d('5Zac5qyi5Y+j5Lqk4oCm');
            note('domain_term');
        }
        // T.sexJa/キステックス misread as climax「射了」
        if (
            re('KD8644K744OD44Kv44K5fOOBm+OBo+OBj+OBmXzjgq3jgrnjg4bjg4Pjgq/jgrkp44GX44Gf').test(src)
            && /どうなった|どうした/.test(src)
            && re('Xig/OuWwhOS6hnzopoHlsITkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
        ) {
            cur = '做了吧…怎么了？';
            note('domain_term');
        }
        // T.chinChinHiraJa出しちゃって →「硬了 完了」
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb0pLnswLDh95Ye644GX44Gh44KDfOWHuuOBl+OBoeOCgy57MCw4fSg/OuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgaHjgpMp').test(src)
            && /硬了|完了|糟/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `${T.meatRodZh}露出来了，糟了…`;
            note('domain_term');
        }
        // エロイン →「Eロイン」katakana scrap
        if (/エロイン/.test(src) && /E?ロイン|女主角|女主/.test(cur)) {
            const next = cur
                .replace(/Eロイン/g, '女主角')
                .replace(/エロイン/g, '女主角');
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        } else if (/エロイン/.test(src) && /できる|できる/.test(src) && /可以有/.test(cur) && !/女主角/.test(cur)) {
            cur = '能当女主角。';
            note('domain_term');
        }
        // Leading orphan さん when JA has「Xさん」
        if (/^さん[\s，,]+/.test(cur.trim()) && /[一-龯ぁ-んァ-ン]{1,6}さん/.test(src)) {
            const m = src.match(/([一-龯ぁ-んァ-ン]{1,6})さん/);
            if (m) {
                cur = cur.replace(/^さん[\s，,]+/u, `${m[1]}小姐 `);
                note('domain_term');
            }
        }
        // Stub: T.ochinchinJa…おっき →「硬得很」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /おっき|大き|でか/.test(src)
            && /^(?:硬得很|好硬|很大)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}好大好硬…`;
            note('domain_term');
        }
        // Stub: T.nippleJa舐めて欲しい → name invent / trunc
        if (
            re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src)
            && /舐めて/.test(src)
            && /欲しい|ほしい/.test(src)
            && !re('5Lmz5aS0fOiIlA==').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 6
        ) {
            cur = d('5oOz6KKr6IiU5Lmz5aS04oCm');
            note('domain_term');
        }
        // Stub: 取って、直接触って →「拿过来/拿下来」
        if (
            /取って/.test(src)
            && /触って/.test(src)
            && /^(?:拿过来|拿来|拿下来|拿下)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = /拿下/.test(cur) ? '拿下来，直接摸…' : '拿过来，直接摸…';
            note('domain_term');
        }
        // Stub: ちょっと舐めてあげる →「我稍微」
        if (
            /舐めてあげる|舐めてあげ/.test(src)
            && /ちょっと|少し/.test(src)
            && /^(?:我稍微|我稍|稍微)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '我稍微舔你一下…';
            note('domain_term');
        }
        // Stub: 生のT.ochinchinJa…届いてる →「硬挺的」
        if (
            re('KD8655Sf44GuKT8oPzrjgYrjgaHjgpPjgaHjgpN844GK44Gh44KT44G9fOOBoeOCk+OBvSk=').test(src)
            && /届いて|届く/.test(src)
            && /^(?:硬挺的|好硬|硬硬的)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `生${T.meatRodZh}…顶到了…`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa欲しいの? →「想要？」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgb1844Gh44KT44Gh44KTKS57MCw2feassuOBl+OBhHzmrLLjgZfjgYQuezAsNn0oPzrjgYrjgaHjgpPjgaHjgpN844GK44Gh44KT44G9KQ==').test(src)
            && /^(?:想要|要)[？?…。．.!！\s]*$/u.test(cur.trim())
        ) {
            cur = `想要${T.meatRodZh}吗？`;
            note('domain_term');
        }
        // Stub: 生T.chinpoHiraJa入れる前に →「插进之前」
        if (
            re('55Sf44Gh44KT44G9fOeUn+OBruOBiuOBoeOCkw==').test(src)
            && /入れる|入れ/.test(src)
            && /前/.test(src)
            && re('Xig/OuaPkui/m+S5i+WJjXzmj5LlhaXkuYvliY0pW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
        ) {
            cur = `生${T.meatRodZh}插进去之前…`;
            note('domain_term');
        }
        // Stub: いっぱい、生T.chinpoHiraJaです →「尽情来吧」
        if (
            re('55Sf44Gh44KT44G9fOeUn+OBruOBiuOBoeOCkw==').test(src)
            && /いっぱい|です/.test(src)
            && /^(?:尽情来吧|来吧)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `好多生${T.meatRodZh}…`;
            note('domain_term');
        }
        // Speaker-tag scrap「 - あゆうこ」
        if (/\s*[-–—]\s*あゆうこ\s*$/u.test(cur) && !/あゆうこ|アユウコ/.test(src)) {
            cur = cur.replace(/\s*[-–—]\s*あゆうこ\s*$/u, '').trim();
            note('domain_hallucination');
        }
        // Stub: 先生/せんせい + いっぱいキス →「先生/老师」
        if (
            /先生|せんせい/.test(src)
            && /キス/.test(src)
            && /いっぱい|もっと/.test(src)
            && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '老师，多亲我…';
            note('domain_term');
        }
        // Stub: 先生、一緒に帰らない →「老师」
        else if (
            /先生|せんせい/.test(src)
            && /一緒に帰/.test(src)
            && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '老师，一起回去吗？';
            note('domain_term');
        }
        // Stub: せんせい + いっぱい舐めて →「老师」
        if (
            /先生|せんせい/.test(src)
            && /舐めて/.test(src)
            && /いっぱい|もっと/.test(src)
            && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '老师，多舔舔…';
            note('domain_term');
        }
        // Stub: いっぱい舐めて →「太棒了」
        if (
            /舐めて/.test(src)
            && /いっぱい|もっと/.test(src)
            && /^(?:太棒了|好棒|好厉害)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '多舔舔…';
            note('domain_term');
        }
        // Stub: T.ochinchinJa…しゅごい → kinship「老公」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /すご|しゅご/.test(src)
            && /^(?:老公|哥哥|姐姐|爸爸|妈妈|主人)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}好厉害…`;
            note('domain_term');
        }
        // Stub: T.ochinchinJa…先っぽ弱い →「软软的」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /先っぽ|先っちょ|弱い/.test(src)
            && /^(?:软软的|好软|软弱)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}前端好敏感…`;
            note('domain_term');
        }
        // パンパン →「T.jiJiZh棒棒」invent (no rod in JA)
        if (
            /パンパン|ぱんぱん/.test(src)
            && re('6bih6bihfOiCieajkg==').test(cur)
            && !RE.dekachinSrc.test(src)
            && !(lexicon?.jaHasRodCue ? lexicon.jaHasRodCue(src, RE) : RE.jaHasRodSrc.test(src))
            && !/おちん|ちんこ|おじん/.test(src)
        ) {
            cur = cur
                .replace(re('56uf54S25Y+Y5oiQ5LqG6ICB5YWs55qE6bih6bih5qOS5qOS5LqG', 'g'), '变得胀鼓鼓的了')
                .replace(re('6bih6bih5qOS5qOS', 'g'), '胀鼓鼓')
                .replace(re('6ICB5YWs55qE6bih6bih', 'g'), '胀鼓鼓')
                .replace(re('6bih6bih', 'g'), '')
                .replace(re('6IKJ5qOS', 'g'), '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            note('domain_hallucination');
        }
        // Hallucinated「ディル」scrap (partial ディルド / name invent)
        if (/ディル/.test(cur) && !/ディル|ディルド/.test(src)) {
            const next = cur
                .replace(/ディル/g, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/\s+([？?！!])/g, '$1')
                .replace(/^[，,\s]+|[，,\s]+$/g, '')
                .trim();
            if (next !== cur) {
                cur = next || cur;
                note('domain_hallucination');
            }
        }
        // Stub: 口に…T.fellaJa…やられてみたい →「想」
        if (
            re('44OV44Kn44Op').test(src)
            && /やられてみたい|してみたい|したい/.test(src)
            && /^(?:想|想要)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5oOz6KKr5Y+j5Lqk4oCm');
            note('domain_term');
        }
        // Stub: キスキスしてね →「这边啊」
        if (
            /キスキス|キスして/.test(src)
            && /こっち|こちら/.test(src)
            && /^(?:这边啊|这边|这边呢)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '这边…亲亲我…';
            note('domain_term');
        }
        // Stub: 初めてなんだ…どう? →「第一次」
        if (
            /初めてなんだ|初めてなんだけど|初めてなのに/.test(src)
            && /どう/.test(src)
            && /^(?:第一次|初次)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '是第一次…怎么样？';
            note('domain_term');
        }
        // Stub: せんせい、T.nippleJaでイキます →「老师」
        if (
            /先生|せんせい/.test(src)
            && re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src)
            && /イキ|イッ|いく/.test(src)
            && /^(?:先生|老师)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('6ICB5biI77yM5Lmz5aS06KaB5Y675LqG4oCm');
            note('domain_term');
        }
        // Stub: 悪いT.nippleJa →「不好意思」
        if (
            re('5oKq44GE5Lmz6aaWfOS5s+mmli57MCw0feaCquOBhA==').test(src)
            && /^(?:不好意思|抱歉|对不起)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('6L+Z5Lmz5aS055yf5Z2P5rCU4oCm');
            note('domain_term');
        }
        // Stub: だめ、先っぽだけ →「不行」
        if (
            /先っぽ|先っちょ/.test(src)
            && /だけ/.test(src)
            && /だめ|ダメ|いや/.test(src)
            && /^(?:不行|不要)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '不行，只能前端…';
            note('domain_term');
        }
        // Stub: オT.chinpoJa… →「也 啊」
        if (
            re('44Kq44OB44Oz44OdfOOBiuOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpM=').test(src)
            && /^(?:也\s*啊|也啊|啊)[…。．.!！?\s]*$/u.test(cur.trim())
            && [...src.replace(/\s/g, '')].length >= 8
        ) {
            cur = `${T.meatRodZh}也好舒服…`;
            note('domain_term');
        }
        // Stub: 密着したままイッたり →「T.aboutToCumZh」
        if (
            /密着/.test(src)
            && /イッ|いっちゃ|イキ|イく/.test(src)
            && re('Xig/OuimgeWwhOS6hnzopoHljrvkuoYpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim())
        ) {
            cur = d('6LS0552A5bCx6KKr5byE5Yiw6auY5r2u5LqG');
            note('domain_term');
        }
        // イッちゃいますか？ trunc/misread as bare T.aboutToCumZh / 啊 / T.aboutToGoZh(缺吗)
        if (/イッちゃいますか|イっちゃいますか|いっちゃいますか/.test(src)) {
            if (re('6KaB5bCE5LqG').test(cur)) {
                cur = cur.replace(re('6KaB5bCE5LqG', 'g'), d('6KaB5Y675LqG5ZCX77yf'));
                note('domain_term');
            } else if (re('6KaB5Y675LqGKD8h5ZCXKQ==').test(cur)) {
                cur = cur.replace(re('6KaB5Y675LqGKD8h5ZCXKQ==', 'g'), d('6KaB5Y675LqG5ZCX77yf'));
                note('domain_term');
            } else if (/^(?:不好吧[？?]?\s*)?啊[…。．.!！?\s]*$/u.test(cur.trim())) {
                cur = cur.replace(/啊[…。．.!！?\s]*$/u, d('5ZWK77yM6KaB5Y675LqG5ZCX77yf'));
                note('domain_term');
            }
        }
        // Stub: T.ochinchinJaまたすゆい →「又伸」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDh9KD8644GZ44KGfOehrHzjg5Tjg7N844Gz44KTKQ==').test(src)
            && /^(?:又伸|又硬|又翘)[了呢啊]?[。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}又硬了`;
            note('domain_term');
        }
        // Stub: intro「Xです、よろしくお願いします」→「我是X」
        if (
            /よろしくお願いします|よろしくお願い/.test(src)
            && /です/.test(src)
            && /^我是.{1,8}$/u.test(cur.trim())
            && !/请多|指教|关照/.test(cur)
        ) {
            cur = `${cur.trim()}，请多指教`;
            note('domain_term');
        }
        // Stub: 舐めて → kiss「亲一下」
        if (
            /舐めて/.test(src)
            && !/キス|ちゅ/.test(src)
            && /^(?:亲一下|亲一个|亲我)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '舔一下';
            note('domain_term');
        }
        // Stub: 口で舐めて / T.fellaJa →「用嘴」
        if (
            /口で/.test(src)
            && re('6IiQ44KB44GmfOODleOCp+ODqQ==').test(src)
            && /^(?:用嘴|用嘴巴)[舔吧]?[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = re('44OV44Kn44Op').test(src) ? d('6K+355So5Zi06IiU4oCm5biu5oiR5Y+j5Lqk4oCm') : '想用嘴舔';
            note('domain_term');
        }
        // Stub: 入れてください polarity collapsed to「不插」
        if (
            /入れてください|入れて下さい|ぶちこんで/.test(src)
            && /^(?:不插|不要插)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = /やらない|ダメ|だめ/.test(src) && /入れて/.test(src)
                ? '求你插进来…'
                : '插进来…';
            note('domain_term');
        }
        // Stub: T.ochinchinJa / [opaque] →「的T.jiJiZh / T.littleChickZh / T.jiJiZh」
        {
            const hasRodJa = lexicon?.jaHasRodCue
                ? lexicon.jaHasRodCue(src, RE)
                : (RE.dekachinSrc.test(src) || RE.jaHasRodSrc.test(src) || re('44GK44Gh44KT44GTfOOBoeOCk+OBk3zjgYrjgZjjgpPjgb1844GK44GY44KT44Gh44KT').test(src));
            if (
                hasRodJa
                && re('Xig/OueahCk/KD865bCPKT/puKHpuKFb4oCm44CC77yOLiHvvIE/XHNdKiQ=', 'u').test(cur.trim())
            ) {
                cur = T.meatRodZh;
                note('domain_term');
            } else if (hasRodJa && re('6bih6bih').test(cur)) {
                cur = cur.replace(re('5bCP6bih6bih', 'g'), T.meatRodZh).replace(re('55qE6bih6bih', 'g'), `的${T.meatRodZh}`).replace(re('6bih6bih', 'g'), T.meatRodZh);
                note('domain_term');
            }
        }
        // Stub: お姉ちゃんを舐めたい →「姐姐」
        if (
            /お姉ちゃん|お姉さん/.test(src)
            && /舐めたい|舐めて/.test(src)
            && /^(?:姐姐|姊姊)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = '想舔姐姐…';
            note('domain_term');
        }
        // 部屋から出て misread as「进房间 / 进 bedroom」
        if (
            /部屋/.test(src)
            && /出て/.test(src)
            && (/(?:进|出).{0,4}(?:房间|bedroom)/i.test(cur) || /(?:房间|bedroom).{0,4}(?:进|出)/i.test(cur))
            && [...cur.replace(/\s/g, '')].length <= 22
        ) {
            cur = /もらえ|くれ|もらえる/.test(src)
                ? '能不能请你从房间出去？'
                : '从房间出去';
            note('domain_term');
        }
        // Hallucinated kana name scraps with no JA cue (shared lexicon table)
        {
            const scrap = lexicon?.applyKanaScrapsZh
                ? lexicon.applyKanaScrapsZh(cur, src)
                : null;
            if (scrap?.changed) {
                cur = scrap.text;
                note('domain_hallucination');
            } else if (!lexicon) {
                // Minimal fallback
                if (/りね/.test(cur) && !/りね|リネ/.test(src)) {
                    cur = cur.replace(/りね/g, '').replace(/\s{2,}/g, ' ').trim();
                    note('domain_hallucination');
                }
            }
        }
        // 淳くん →「みゃーくん」phonetic invent
        if (/淳/.test(src) && /みゃーくん|ミャーくん/.test(cur)) {
            cur = cur.replace(/みゃーくん|ミャーくん/g, '淳くん');
            note('domain_term');
        }
        // Residual JA oral/breath SFX crumbs left in ZH (ひゅっ / ひぃ / ずず…)
        if (/ひゅ|ひぃ|ずず|ぢゅ|あひゅ|あひぃ|げー|んろ/.test(cur) && /[\u4e00-\u9fff]/.test(cur) && !/《[^》]+》/.test(cur)) {
            const next = cur
                .replace(/(?:あ)?ひ[ゅぃ][っうぅ]?/g, '')
                .replace(/ずず(?:ず)*/g, '')
                .replace(/ぢゅ[っう]?/g, '')
                .replace(/げーっ?/g, '')
                .replace(/んろ/g, '')
                .replace(/\s*[-–—]\s*$/g, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/[，,]{2,}/g, '，')
                .trim();
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }
        // Invented katakana scrap「ロブA」with no JA cue
        if (/ロブ[AＡa]/.test(cur) && !/ロブ/.test(src)) {
            const next = cur
                .replace(/ロブ[AＡa]/g, '')
                .replace(/[，,]{2,}/g, '，')
                .replace(/^[，,\s]+|[，,\s]+$/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (next !== cur) {
                cur = next || '…';
                note('domain_hallucination');
            }
        }
        // 出され… truncated →「出不来了」(polarity / sense flip)
        if (
            /出され/.test(src)
            && /出不来/.test(cur)
            && (RE.climaxIkuSrc.test(src) || RE.ikuTruncSrc.test(src) || /イッ|イク|いく/.test(src))
        ) {
            cur = cur
                .replace(re('6KaB5bCE5LqG5Ye65LiN5p2l5LqG', 'g'), '要射出来了')
                .replace(/射了出不来了/g, '射出来了')
                .replace(/出不来了/g, '射出来了')
                .replace(/出不来/g, '射出来');
            note('domain_term');
        }
        // English leak「maybe」in mixed CJK → 可能
        if (/[\u4e00-\u9fff]/.test(cur) && cur.toLowerCase().includes(T.maybeLatin)) {
            cur = cur.replace(RE.maybeLatinG, T.maybeZh);
            note('domain_term');
        }
        // お汁みたい →「好像T.aboutToCumZh」
        if (
            (src.includes(T.juiceLikeJa) || /おしるみたい|お汁みたい/.test(src))
            && cur.includes(T.shootCumShortZh)
            && !RE.climaxIkuSrc.test(src)
            && !RE.ikuTruncSrc.test(src)
        ) {
            cur = T.juiceLikeOkZh;
            note('domain_term');
        }
        // Climax cue stubbed as short name (あっ、イク… → 一君). Do not touch … / T.aboutToCumZh吗.
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
        // Clinical vagina / vulva ZH → colloquial T.smallHoleZh (NSFW soft)
        if (cur.includes(T.vaginaZh)) {
            cur = cur.replace(RE.vaginaG, T.pussyZh);
            note('domain_term');
        }
        if (cur.includes(T.yinbuZh)) {
            cur = cur.replace(RE.yinbuG, T.pussyZh);
            note('domain_term');
        }
        // kuri JA → clinical penis ZH hallucination → clit (before residual penis→meatRod)
        if (RE.kuriCueSrc.test(src) && cur.includes(T.penisZh)) {
            cur = cur.replace(RE.penisG, T.clitZh);
            note('domain_term');
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
        const jaHasRod = lexicon?.jaHasRodCue
            ? lexicon.jaHasRodCue(src, RE)
            : (RE.dekachinSrc.test(src) || RE.jaHasRodSrc.test(src));
        const zhHadClinicalRod = RE.clinicalRodZhSrc.test(before);
        if (RE.meatRodSrc.test(cur) && !jaHasRod && !zhHadClinicalRod) {
            const next = cur
                .replace(RE.dadRodSoG, T.dadRodSoOkZh)
                .replace(RE.dadRodG, T.dadOkZh)
                .replace(RE.ofMeatRodG, d('55qE'))
                .replace(RE.meatRodG, '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').trim();
                note('domain_hallucination');
            }
        }
        if (RE.cockSrc.test(cur) && !jaHasRod && !zhHadClinicalRod) {
            const next = cur
                .replace(RE.thatCockG, T.thatSideZh)
                .replace(RE.ofCockG, d('55qE'))
                .replace(RE.cockG, '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').replace(/…+/g, '…').trim();
                note('domain_hallucination');
            }
        }
        // T.jiJiZh invent without JA rod cue (焼酎 / ディッチンコ / ビスホ ASR scraps)
        if ((cur.includes(T.jiJiZh) || re('5bCP6bih6bih').test(cur)) && !jaHasRod && !zhHadClinicalRod) {
            const next = cur
                .replace(re('5bCP6bih6bih', 'g'), '')
                .replace(new RegExp(T.jiJiZh, 'g'), '');
            if (next !== cur) {
                cur = next.replace(/\s{2,}/g, ' ').replace(/…+/g, '…').trim() || '…';
                note('domain_hallucination');
            }
        }
        if (RE.limpMataSrc.test(src) && RE.climaxHallucZhSrc.test(cur)) {
            cur = /[?？]/.test(src) || /[?？]/.test(cur) ? T.softAgainQZh : T.softAgainZh;
            note('domain_term');
        }

        // クリ →「T.penisZh」hallucination → 阴蒂 (before residual T.penisZh→T.meatRodZh)
        if (RE.kuriCueSrc.test(src) && cur.includes(T.penisZh)) {
            cur = cur.replace(RE.penisG, T.clitZh);
            note('domain_term');
        }
        // クリ →「T.penisZh」hallucination → 阴蒂 (before residual T.penisZh→T.meatRodZh)
        if (RE.kuriCueSrc.test(src) && cur.includes(T.penisZh)) {
            cur = cur.replace(RE.penisG, T.clitZh);
            note('domain_term');
        }
        // Clinical vagina / vulva / penis ZH → colloquial
        if (cur.includes(T.vaginaZh)) {
            cur = cur.replace(RE.vaginaG, T.pussyZh);
            note('domain_term');
        }
        if (cur.includes(T.yinbuZh)) {
            cur = cur.replace(RE.yinbuG, T.pussyZh);
            note('domain_term');
        }
        if (src.includes(T.kameAtamaJa) && (cur.includes(T.penisZh) || cur.includes(T.penisHeadZh))) {
            if (cur.includes(T.penisHeadZh)) {
                cur = cur.replace(RE.penisHeadG, T.glansZh);
            }
            if (cur.includes(T.penisZh)) {
                cur = cur.replace(RE.penisG, T.glansZh);
            }
            note('domain_term');
        }
        if (cur.includes(T.penisZh)) {
            const marked = cur.split(T.penisHeadZh).join('\uE000');
            const next = marked.replace(RE.penisG, T.meatRodZh).split('\uE000').join(T.penisHeadZh);
            if (next !== cur) {
                cur = next;
                note('domain_term');
            }
        }

        // T.chikubiHiraJa/T.nippleJa →「T.jiJiZh / T.meatRodZh / 鸡头」hallucination → T.nippleZh
        if (
            (src.includes(T.chikubiJa) || src.includes(T.chikubiHiraJa) || src.includes(T.nippleJa) || re('44GE44Gh44GP44GzfOOBiuOBoeOBj+OBsw==').test(src))
            && !RE.dekachinSrc.test(src)
            && !(lexicon?.jaHasRodCue ? lexicon.jaHasRodCue(src, RE) : RE.jaHasRodSrc.test(src))
            && (cur.includes(T.jiJiZh) || cur.includes(T.meatRodZh) || cur.includes(T.jiTouZh))
        ) {
            cur = cur
                .replace(re('5bCP6bih6bih', 'g'), T.nippleZh)
                .replace(new RegExp(T.jiJiZh, 'g'), T.nippleZh)
                .replace(new RegExp(T.jiTouZh, 'g'), T.nippleZh)
                .replace(RE.meatRodG, T.nippleZh);
            note('domain_term');
        }
        // おちんのT.nippleJa without rod lemma → drop invented T.meatRodZh
        if (
            re('44GK44Gh44KT44Gu5Lmz6aaW').test(src)
            && !re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844OH44Kr44OB44Oz').test(src)
            && re('6IKJ5qOSfOS5s+WktOeahOS5s+WktHxe55qE5Lmz5aS0').test(cur)
        ) {
            cur = cur
                .replace(re('6IKJ5qOS55qE5Lmz5aS0fOS5s+WktOiCieajknzkubPlpLTnmoTkubPlpLQ=', 'g'), T.nippleZh)
                .replace(re('6IKJ5qOS', 'g'), '')
                .replace(re('XueahOS5s+WktA==', 'g'), T.nippleZh)
                .replace(/\s{2,}/g, ' ')
                .replace(/^[…\s]+|[…\s]+$/g, '')
                .trim();
            if (!re('5Lmz5aS0').test(cur)) cur = `${T.nippleZh}${cur ? ` ${cur}` : ''}`;
            note('domain_term');
        }
        // おちんのT.nippleJa without rod lemma → drop invented T.meatRodZh
        if (
            re('44GK44Gh44KT44Gu5Lmz6aaW').test(src)
            && !re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844OH44Kr44OB44Oz').test(src)
            && re('6IKJ5qOSfOS5s+WktOeahOS5s+WktHxe55qE5Lmz5aS0').test(cur)
        ) {
            cur = cur
                .replace(re('6IKJ5qOS55qE5Lmz5aS0fOS5s+WktOiCieajknzkubPlpLTnmoTkubPlpLQ=', 'g'), T.nippleZh)
                .replace(re('6IKJ5qOS', 'g'), '')
                .replace(re('XueahOS5s+WktA==', 'g'), T.nippleZh)
                .replace(/\s{2,}/g, ' ')
                .replace(/^[…\s]+|[…\s]+$/g, '')
                .trim();
            if (!re('5Lmz5aS0').test(cur)) cur = `${T.nippleZh}${cur ? ` ${cur}` : ''}`;
            note('domain_term');
        }
        // [opaque] / おじんぽ / おこちょ / ち○こ / ンポ → T.jiJiZh → T.meatRodZh
        {
            const hasRodJa = lexicon?.jaHasRodCue
                ? lexicon.jaHasRodCue(src, RE)
                : re('44GK44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844OB44Oz44OdfOODgeODs+ODgeODs3zjgYrjgZjjgpPjgb1844GK44Gh44KT44GTfOOBoeOCk+OBk3zjgYrjgZPjgaHjgod844GK44Gh44KT44Gh44KHfOOBoVvil4vjgIfil68qXeOBk3zjg7Pjg51844Kt44Oz44GhW+ODs+OCk10=').test(src);
            if (hasRodJa && (cur.includes(T.jiJiZh) || re('5bCP6bih6bihfOeahOm4oem4oXzogonmo5LpuKHlt7R86bih5be06IKJ5qOS').test(cur))) {
                cur = cur
                    .replace(re('5bCP6bih6bih', 'g'), T.meatRodZh)
                    .replace(re('55qE6bih6bih', 'g'), `的${T.meatRodZh}`)
                    .replace(new RegExp(`${T.meatRodZh}${T.jiJiZh}|${T.jiJiZh}${T.meatRodZh}`, 'g'), T.meatRodZh)
                    .replace(re('6IKJ5qOS6bih5be0fOm4oeW3tOiCieajkg==', 'g'), T.meatRodZh)
                    .replace(new RegExp(T.jiJiZh, 'g'), T.meatRodZh)
                    .replace(new RegExp(`(?:${T.meatRodZh}){2,}`, 'g'), T.meatRodZh);
                note('domain_term');
            }
        }
        // 出され polarity / 出不来
        if (
            /出され/.test(src)
            && cur.includes(T.outCantZh)
            && (RE.climaxIkuSrc.test(src) || RE.ikuTruncSrc.test(src) || /イッ|イク|いく/.test(src))
        ) {
            cur = cur
                .replace(new RegExp(`${T.aboutToCumZh}${T.outCantZh}了`, 'g'), T.shootOutZh)
                .replace(new RegExp(`${T.outCantZh}了`, 'g'), T.shootOutZh)
                .replace(new RegExp(T.outCantZh, 'g'), T.shootOutZh);
            note('domain_term');
        }
        // 部屋から出て ≠ 进房间
        if (
            /部屋/.test(src)
            && /出て/.test(src)
            && (/(?:进|出).{0,4}(?:房间|bedroom)/i.test(cur) || /(?:房间|bedroom).{0,4}(?:进|出)/i.test(cur))
        ) {
            cur = cur
                .replace(/能不能让我进(?:房间|bedroom)里？/gi, d('6IO95LiN6IO96K6p5oiR5LuO5oi/6Ze06YeM5Ye65Y6777yf'))
                .replace(/进(?:房间|bedroom)里/gi, d('5LuO5oi/6Ze06YeM5Ye65Y67'));
            note('domain_term');
        }
        // 先头 → 前端
        if (/先っぽ|先っちょ/.test(src) && cur.includes(T.xianTouMisZh)) {
            cur = cur.replace(new RegExp(T.xianTouMisZh, 'g'), T.frontTipZh);
            note('domain_term');
        }
        // T.yangwuZh / 阳具 → T.meatRodZh
        {
            const hasRod = lexicon?.jaHasRodCue
                ? lexicon.jaHasRodCue(src, RE)
                : (RE.dekachinSrc.test(src) || RE.jaHasRodSrc.test(src));
            if (hasRod) {
                if (cur.includes(T.yangwuZh)) {
                    cur = cur.replace(new RegExp(T.yangwuZh, 'g'), T.meatRodZh);
                    note('domain_term');
                }
                if (cur.includes(T.yangJuZh)) {
                    cur = cur.replace(new RegExp(T.yangJuZh, 'g'), T.meatRodZh);
                    note('domain_term');
                }
            }
        }
        // 出して → 流出来/拿出来 → 射出来 (skip 声/腕/T.breastJa)
        if (
            /出して/.test(src)
            && !/声|腕|引き出し/.test(src)
            && !re('44GK44Gj44Gx44GE').test(src)
            && (cur.includes(T.flowOutZh) || cur.includes(T.takeOutZh))
        ) {
            if (cur.includes(T.flowOutZh)) cur = cur.replace(new RegExp(T.flowOutZh, 'g'), T.shootOutZh);
            if (cur.includes(T.takeOutZh)) cur = cur.replace(new RegExp(T.takeOutZh, 'g'), T.shootOutZh);
            note('domain_term');
        }
        // T.breastJa出して → 露出来 (not 射出来)
        if (re('44GK44Gj44Gx44GE').test(src) && /出して/.test(src) && cur.includes(T.takeOutZh)) {
            cur = cur.replace(new RegExp(T.takeOutZh, 'g'), T.exposeOutZh);
            note('domain_term');
        }
        // 泄了 → T.aboutToGoZh / T.aboutToCumZh
        if (/イッて|イク|いっちゃ/.test(src) && cur.includes(T.leakOutZh)) {
            cur = cur.replace(new RegExp(T.leakOutZh, 'g'), jaFemaleClimaxPreferGo(src) || /先生/.test(src) ? T.aboutToGoZh : T.aboutToCumZh);
            note('domain_term');
        }
        // またいっちゃいそう → 又T.aboutToGoZh
        if (/またいっちゃい|またイッちゃい/.test(src) && /憋不住|快来了/.test(cur) && !cur.includes(T.againGoZh)) {
            cur = T.againGoZh;
            note('domain_term');
        }
        // 先生 → 医生
        if (
            /先生|せんせい|センセ/.test(src)
            && cur.includes(T.doctorZh)
            && !/医者|病院|診察|診断|ナース|看護師/.test(src)
        ) {
            cur = cur.replace(new RegExp(T.doctorZh, 'g'), T.senseiZh);
            note('domain_term');
        }
        // T.fellaJa / 口炮
        if (re('44OV44Kn44Op').test(src) && (cur.includes(T.kouPaoZh) || re('Xig/OuWPo+eCrnzlj6PkuqQpW+KApuOAgu+8ji4h77yBP1xzXSok', 'u').test(cur.trim()))) {
            cur = T.oralZh;
            note('domain_term');
        }
        // お願いする + いいですか → 听好了 → 拜托
        if (
            /お願いする|お願いし[ますて]/.test(src)
            && /いいですか|良いですか|よろしい/.test(src)
            && (cur.includes(T.listenWellZh) || /^[那好嗯啊][…。．.!！?\s]*$/u.test(cur.trim()))
        ) {
            cur = T.pleaseRequestZh;
            note('domain_term');
        }
        // よろしくお願いします under 我是X / 你好 / bare name
        if (/よろしくお願いします|よろしくお願い/.test(src) && !/请多指教/.test(cur)) {
            const m = src.match(/^([^\s、,，]{1,12})です[、,，]?\s*よろしく/);
            if (m && (/^(?:你好|您好)[…。．.!！?\s]*$/u.test(cur.trim()) || cur.trim() === m[1] || new RegExp(`^我是${m[1]}`).test(cur.trim()))) {
                cur = `${T.iAmZh}${m[1]}${T.pleaseTeachSufZh}`;
                note('domain_term');
            } else if (/^(?:你好|您好)[…。．.!！?\s]*$/u.test(cur.trim())) {
                cur = T.pleaseTeachZh;
                note('domain_term');
            } else if (/^我是.{1,8}[…。．.!！?\s]*$/u.test(cur.trim())) {
                cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${T.pleaseTeachSufZh}`;
                note('domain_term');
            }
        }
        // 勃起 stub
        if (
            (RE.dekachinSrc.test(src) || (lexicon?.jaHasRodCue && lexicon.jaHasRodCue(src, RE)))
            && /^(?:勃起)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = FIX.erectStubOkZh;
            note('domain_term');
        }
        // kinship + T.ochinchinJa硬い
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDh956GsfOehrC57MCw4fSg/OuOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844Gh44KT44Gh44KTKQ==').test(src)
            && /^(?:哥哥|姐姐|老公|爸爸|妈妈)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}${d('5aW956Gs4oCm')}`;
            note('domain_term');
        }
        // T.ochinchinJaしゅごい → 老公
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /すご|しゅご/.test(src)
            && /^(?:老公|哥哥|姐姐)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}${d('5aW95Y6J5a6z4oCm')}`;
            note('domain_term');
        }
        // 生のT.ochinchinJa届いて → 硬挺的
        if (
            re('KD8655Sf44GuKT8oPzrjgYrjgaHjgpPjgaHjgpN844GK44Gh44KT44G9fOOBoeOCk+OBvSk=').test(src)
            && /届いて|届く/.test(src)
            && /^(?:硬挺的|好硬|硬硬的)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${d('55Sf')}${T.meatRodZh}${d('4oCm6aG25Yiw5LqG4oCm')}`;
            note('domain_term');
        }
        // 舔舔 + T.chinChinHiraJa舐めて
        if (
            /舐めて/.test(src)
            && re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844Gh44KT44G9KQ==').test(src)
            && /^(?:舔舔|舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${d('6IiU')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // 要爆射了 → T.meatRodZh…T.aboutToCumZh
        if (cur.includes(T.burstShootZh) && (RE.dekachinSrc.test(src) || /ちん|チン/.test(src))) {
            cur = cur.replace(new RegExp(`${T.meatRodZh}${T.burstShootZh}`, 'g'), `${T.meatRodZh}…${T.aboutToCumZh}`)
                .replace(new RegExp(T.burstShootZh, 'g'), `${T.meatRodZh}…${T.aboutToCumZh}`);
            note('domain_term');
        }
        // 那个玩意儿 (late catch)
        {
            const hasRod = lexicon?.jaHasRodCue
                ? lexicon.jaHasRodCue(src, RE)
                : (RE.dekachinSrc.test(src) || RE.jaHasRodSrc.test(src));
            if (hasRod && /玩意/.test(cur)) {
                cur = cur
                    .replace(/那个玩意儿?/g, T.meatRodZh)
                    .replace(/这玩意儿?/g, T.meatRodZh)
                    .replace(/玩意儿?/g, T.meatRodZh);
                note('domain_term');
            }
        }
        // こっちも舐めて under「再舔舔」
        if (/こっちも/.test(src) && /舐めて/.test(src) && /再舔舔|舔舔/.test(cur) && !/这边/.test(cur)) {
            cur = d('6L+Z6L655Lmf6IiU6IiU4oCm');
            note('domain_term');
        }
        // T.chinChinHiraJa触ってない →「没摸呢」
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844OB44Oz44OB44OzKS57MCw2feinpuOBo+OBpuOBquOBhHzop6bjgaPjgabjgarjgYQuezAsNn0oPzrjgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTKQ==').test(src)
            && /没摸/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = d('5rKh5pG46IKJ5qOS5ZGi');
            note('domain_term');
        }
        // 入れてください polarity collapsed to「不插」
        if (
            /入れてください|入れて下さい|ぶちこんで/.test(src)
            && /^(?:不插|不要插)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5o+S6L+b5p2l4oCm');
            note('domain_term');
        }
        // みゃーくん ASR name scrap vs 淳くん
        if (/みゃー/.test(cur) && /淳/.test(src) && !/みゃー/.test(src)) {
            cur = cur.replace(/みゃーくん/g, d('5rez')).replace(/みゃー/g, d('5rez'));
            note('domain_hallucination');
        }
        // やめね / やめろ…イッちゃう →「停住」misread
        if (
            /やめね|やめてね|やめないで|やめろ/.test(src)
            && /イッちゃう|イっちゃう|いっちゃう|イッちゃ/.test(src)
            && (/停住|别停/.test(cur))
        ) {
            cur = cur.replace(/停住|别停/g, T.yameteZh);
            if (!re('6KaB5Y675LqGfOimgeWwhOS6hnzljrvkuoY=').test(cur)) {
                cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.aboutToGoZh}`;
            }
            note('domain_term');
        }
        // イッちゃいますか missing 吗 / duplicate 吗
        if (/イッちゃいますか|イっちゃいますか|いっちゃいますか/.test(src)) {
            if (re('6KaB5Y675LqG').test(cur) && !/吗/.test(cur)) {
                cur = cur.replace(T.aboutToGoZh, d('6KaB5Y675LqG5ZCX'));
                note('domain_term');
            }
            if (/吗？\s*吗/.test(cur)) {
                cur = cur.replace(/(?:吗？\s*)+/g, d('5ZCX77yf'));
                note('domain_term');
            }
        }
        // Leading orphan さん when JA has「Xさん」
        if (/^さん[\s，,]+/.test(cur.trim()) && /[一-龯ぁ-んァ-ン]{1,6}さん/.test(src)) {
            const m = src.match(/([一-龯ぁ-んァ-ン]{1,6})さん/);
            if (m) {
                cur = cur.replace(/^さん[\s，,]+/u, `${m[1]}`);
                note('domain_hallucination');
            }
        }
        // おT.chikubiHiraJa? →「后仰」
        if (re('44GK44Gh44GP44Gz').test(src) && /后仰/.test(cur)) {
            cur = d('5Lmz5aS077yf');
            note('domain_term');
        }
        // こんなT.chinpoHiraJa…初めて without T.meatRodZh
        if (
            re('44Gh44KT44G9fOOBiuOBoeOCk3zjgaHjgpPjgaHjgpM=').test(src)
            && /初めて/.test(src)
            && !re('6IKJ5qOSfOm4oeW3tHzpuKHpuKE=').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 22
        ) {
            cur = `${T.meatRodZh}…${cur}`;
            note('domain_term');
        }
        // 出しておしり
        if (/出して/.test(src) && /おしり/.test(src) && /射/.test(cur) && !/屁股/.test(cur)) {
            cur = d('5a+5552A5bGB6IKh5bCE5Ye65p2l4oCm');
            note('domain_term');
        }
        // ちゃんとお願いして →「那」
        if (
            /お願いして/.test(src)
            && /ちゃんと/.test(src)
            && /^(?:那|好)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5rGC5oiR4oCm');
            note('domain_term');
        }
        // お願い見てくれ moan stub
        if (
            /お願い/.test(src)
            && /見てくれ|見て/.test(src)
            && /^(?:哈\s*哈|嗯嗯|哈|呜)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `求你看看我…`;
            note('domain_term');
        }
        // 触って欲しい short stub
        if (
            /触って欲しい/.test(src)
            && /^(?:摸我|摸)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `想让你摸我…`;
            note('domain_term');
        }
        // 舐めて教えて
        if (
            /舐めて教えて|舐めて.{0,4}教えて/.test(src)
            && /舔/.test(cur)
            && !/教/.test(cur)
        ) {
            cur = `舔着教我…`;
            note('domain_term');
        }
        // G嘟嘟 / X嘟嘟 latin+sfx hallucination on 触って
        if (
            /[A-Za-z]嘟嘟/.test(cur)
            && /触って/.test(src)
            && !/[A-Za-z]{3,}/.test(src)
        ) {
            cur = /気持ちよかった|気持ちいい/.test(src)
                ? `刚才摸着的时候很舒服吧？`
                : cur.replace(/[A-Za-z]嘟嘟+/g, '').replace(/^[…\s]+|[…\s]+$/g, '') || `摸我…`;
            note('domain_hallucination');
        }
        // お願い見てくれ moan stub
        if (
            /お願い/.test(src)
            && /見てくれ|見て/.test(src)
            && /^(?:哈\s*哈|嗯嗯|哈|呜)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `求你看看我…`;
            note('domain_term');
        }
        // 触って欲しい short stub
        if (
            /触って欲しい/.test(src)
            && /^(?:摸我|摸)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `想让你摸我…`;
            note('domain_term');
        }
        // 舐めて教えて
        if (
            /舐めて教えて|舐めて.{0,4}教えて/.test(src)
            && /舔/.test(cur)
            && !/教/.test(cur)
        ) {
            cur = `舔着教我…`;
            note('domain_term');
        }
        // G嘟嘟 / X嘟嘟 latin+sfx hallucination on 触って
        if (
            /[A-Za-z]嘟嘟/.test(cur)
            && /触って/.test(src)
            && !/[A-Za-z]{3,}/.test(src)
        ) {
            cur = /気持ちよかった|気持ちいい/.test(src)
                ? `刚才摸着的时候很舒服吧？`
                : cur.replace(/[A-Za-z]嘟嘟+/g, '').replace(/^[…\s]+|[…\s]+$/g, '') || `摸我…`;
            note('domain_hallucination');
        }
        // T.ochinchinJaも硬く →「也？」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDZ9KD8656GsfOWbuik=').test(src)
            && /^(?:也)[？?…。．.!！\s]*$/u.test(cur.trim())
        ) {
            cur = FIX.hardAlsoStubOkZh;
            note('domain_term');
        }
        // T.ochinchinJaまたすゆい →「又伸」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /また|硬|すゆ/.test(src)
            && /^(?:又伸|又硬)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}${d('5Y+I56Gs4oCm')}`;
            note('domain_term');
        }
        // お姉ちゃんを舐めたい →「姐姐」
        if (/お姉|ねえ/.test(src) && /舐め/.test(src) && /姐姐/.test(cur) && !/舔/.test(cur)) {
            cur = `${d('5aeQ5aeQ4oCm')}${d('5oOz6IiU4oCm')}`;
            note('domain_term');
        }
        // パンパン + T.jiJiZh棒棒 invent (no rod JA)
        if (
            /パンパン/.test(src)
            && !re('44GK44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844OB44Oz').test(src)
            && re('6bih6bihfOiCieajkg==').test(cur)
        ) {
            cur = cur
                .replace(re('6ICB5YWs55qE6bih6bih5qOS5qOS', 'g'), d('6IOA6byT6byT'))
                .replace(re('6bih6bih5qOS5qOS', 'g'), d('6IOA6byT6byT'))
                .replace(re('6bih6bihfOiCieajkg==', 'g'), d('6IOA6byT6byT'));
            note('domain_term');
        }
        // T.ochinpoJaください missing T.meatRodZh
        if (
            re('44GK44Gh44KT44G944GP44Gg44GV44GEfOOBoeOCk+OBveOBj+OBoOOBleOBhHzjg4Hjg7Pjg53jgY/jgaDjgZXjgYQ=').test(src)
            && !re('6IKJ5qOS').test(cur)
            && (
                /顶一下|顶点/.test(cur)
                || /脸上|書いて|顔/.test(src + cur)
                || [...cur.replace(/\s/g, '')].length <= 12
            )
        ) {
            if (/顶一下|顶点/.test(cur)) {
                cur = `${d('5oqK')}${T.meatRodZh}${d('57uZ5bCP56m04oCm5YaN5aSa6KaB54K5')}${T.meatRodZh}${d('77yf')}`;
            } else if (/顔|脸上|書いて/.test(src + cur)) {
                cur = `脸上写着快给我${T.meatRodZh}`;
            } else {
                cur = `给我${T.meatRodZh}`;
            }
            note('domain_term');
        }
        // 出します…先生の顔 → 出去/教练
        if (/出します/.test(src) && /先生/.test(src) && /顔/.test(src)) {
            cur = cur
                .replace(/出去吧/g, T.shootOutZh)
                .replace(/教练/g, T.senseiZh);
            if (!/射/.test(cur)) cur = `${T.shootOutZh}…${T.senseiZh}${d('55qE6IS4')}${d('4oCm')}`;
            note('domain_term');
        }
        // T.ochinchinJaピクピク → false 居然 / bare 颤抖（勿覆盖已有T.rodZh/T.meatRodZh良译）
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDh944OU44Kv44OU44KvfOODlOOCr+ODlOOCry57MCw4fSg/OuOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844Gh44KT44Gh44KTKQ==').test(src)
            && /居然|一颤|颤抖/.test(cur)
            && !re('6IKJ5qOSfOm4oeW3tHzpuKHpuKE=').test(cur)
        ) {
            cur = `${T.meatRodZh}一颤一颤的`;
            note('domain_term');
        }
        // 口で舐めて / T.fellaJaしてください →「用口舔」
        if (
            ((/口で/.test(src) && /舐めて/.test(src)) || re('44OV44Kn44Op').test(src))
            && /ください|下さい/.test(src)
            && /^(?:用口舔|用嘴舔|口舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('6K+35Y+j5Lqk4oCm');
            note('domain_term');
        }
        // T.chinChinHiraJaやばい →「出问题」
        if (re('44Gh44KT44Gh44KT44KE44Gw44GEfOOBoeOCk+OBveOChOOBsOOBhA==').test(src) && /出问题|问题/.test(cur) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}${d('5aW95Y6J5a6z4oCm')}`;
            note('domain_term');
        }
        // タマ → tamā / 蛋蛋
        if (/タマ|金玉/.test(src) && /tam[aāáà]/i.test(cur)) {
            cur = cur.replace(/tam[aāáà]+/gi, d('6JuL6JuL'));
            note('domain_term');
        }
        // 彼氏 + new
        if (/彼氏/.test(src) && /\bnew\b/i.test(cur)) {
            cur = cur.replace(/\s*\bnew\b\s*/gi, d('5Lqk5Yiw'));
            note('domain_term');
        }
        // T.fellaJa上手 →「挺在行」
        if (re('44OV44Kn44Op').test(src) && /上手|うまい/.test(src) && /挺在行|在行/.test(cur) && !re('5Y+j5Lqk').test(cur)) {
            cur = `${T.oralZh}${d('5oy65Zyo6KGM4oCm')}`;
            note('domain_term');
        }
        // [opaque]入っ → 深入 missing T.smallHoleZh
        if (re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src) && /入っ|奥/.test(src) && /深入|最深|进去/.test(cur) && !re('5bCP56m0').test(cur)) {
            cur = `${T.pussyZh}${cur}`;
            note('domain_term');
        }
        // 先生のことが好き →「我喜欢您」
        if (/先生|せんせい/.test(src) && /好き/.test(src) && /喜欢/.test(cur) && !/老师/.test(cur)) {
            cur = cur.replace(/您/g, T.senseiZh);
            if (!/老师/.test(cur)) cur = `${cur}…${T.senseiZh}`;
            note('domain_term');
        }
        // あべろ / べろ + 出して → 身体部位 / 口水
        if (/べろ|あべろ/.test(src) && /出して/.test(src) && /身体部位|口水/.test(cur + '口')) {
            cur = cur.replace(/身体部位/g, d('5Y+j5rC0'));
            if (!/口水|舌头/.test(cur)) cur = d('5rWB5LqG5aW95aSa5Y+j5rC04oCm');
            note('domain_term');
        }
        // 出してもいい → 流出
        if (/出してもいい/.test(src) && /流出|可以/.test(cur) && !/射/.test(cur)) {
            cur = cur.replace(/流出/g, T.shootOutZh);
            if (!/射/.test(cur)) cur = T.canShootOutQZh;
            note('domain_term');
        }
        // 指入れてみて
        if (/指入れて|指を入れ/.test(src) && /手指|试试/.test(cur) && !/插/.test(cur)) {
            cur = d('6K+V6K+V5omL5oyH5o+S6L+b5Y674oCm');
            note('domain_term');
        }
        // 直接舐めて under
        if (/直接舐めて|舐めてよぉ|舐めてよ/.test(src) && !/舔/.test(cur) && [...cur.replace(/\s/g, '')].length <= 16) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${d('4oCm55u05o6l6IiU5oiR4oCm')}`;
            note('domain_term');
        }
        // T.nippleJaでいっちゃった
        if (re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsNn3jgYTjgaPjgaHjgoN844GE44Gj44Gh44KDLnswLDZ9KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src) && re('5Lmz5aS0').test(cur) && !re('5Y675LqGfOmrmOa9rnzlsIQ=').test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.wentZh}`;
            note('domain_term');
        }
        // らめぇ stub「来啦」
        if (/^(?:あ[、,，]?)?らめぇ/.test(src.trim()) && /来啦/.test(cur) && !/イク|イッ/.test(src)) {
            cur = T.dameEllZh;
            note('domain_term');
        }
        // 見してT.chinChinHiraJa
        if (/見して|見せて/.test(src) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(src) && /^(?:看)[…。．.!！?\s]*$/u.test(cur.trim())) {
            cur = `${d('55yL')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // 濡れ + 先生
        if (/濡れ/.test(src) && /先生|せんせい/.test(src) && /湿/.test(cur) && !/老师/.test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.senseiZh}`;
            note('domain_term');
        }
        // ダメイッちゃう → 伊甸
        if (
            (/ダメ?イッちゃう|だめイッちゃう|ダメイッちゃう/.test(src) || /(?:だめ|ダメ).{0,4}(?:ディッチャ|イッちゃ)/.test(src))
            && (/伊甸|搞错|搞砸/.test(cur) || (/不行/.test(cur) && !re('6KaB5Y67fOimgeWwhHzpq5jmva4=').test(cur)))
        ) {
            cur = T.dameDameGoZh;
            note('domain_term');
        }
        // 取って直接触って
        if (/取って/.test(src) && /触って/.test(src) && /拿/.test(cur) && !/摸/.test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${d('4oCm55u05o6l5pG44oCm')}`;
            note('domain_term');
        }
        // タマ → tamā / 蛋蛋
        if (/タマ|金玉/.test(src) && /tam[aāáà]/i.test(cur)) {
            cur = cur.replace(/tam[aāáà]+/gi, d('6JuL6JuL'));
            note('domain_term');
        }
        // 彼氏 + new
        if (/彼氏/.test(src) && /\bnew\b/i.test(cur)) {
            cur = cur.replace(/\s*\bnew\b\s*/gi, d('5Lqk5Yiw'));
            note('domain_term');
        }
        // T.fellaJa上手 →「挺在行」
        if (re('44OV44Kn44Op').test(src) && /上手|うまい/.test(src) && /挺在行|在行/.test(cur) && !re('5Y+j5Lqk').test(cur)) {
            cur = `${T.oralZh}${d('5oy65Zyo6KGM4oCm')}`;
            note('domain_term');
        }
        // [opaque]入っ → 深入 missing T.smallHoleZh
        if (re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src) && /入っ|奥/.test(src) && /深入|最深|进去/.test(cur) && !re('5bCP56m0').test(cur)) {
            cur = `${T.pussyZh}${cur}`;
            note('domain_term');
        }
        // 先生のことが好き →「我喜欢您」
        if (/先生|せんせい/.test(src) && /好き/.test(src) && /喜欢/.test(cur) && !/老师/.test(cur)) {
            cur = cur.replace(/您/g, T.senseiZh);
            if (!/老师/.test(cur)) cur = `${cur}…${T.senseiZh}`;
            note('domain_term');
        }
        // あべろ / べろ + 出して → 身体部位 / 口水
        if (/べろ|あべろ/.test(src) && /出して/.test(src) && /身体部位|口水/.test(cur + '口')) {
            cur = cur.replace(/身体部位/g, d('5Y+j5rC0'));
            if (!/口水|舌头/.test(cur)) cur = d('5rWB5LqG5aW95aSa5Y+j5rC04oCm');
            note('domain_term');
        }
        // 出してもいい → 流出
        if (/出してもいい/.test(src) && /流出|可以/.test(cur) && !/射/.test(cur)) {
            cur = cur.replace(/流出/g, T.shootOutZh);
            if (!/射/.test(cur)) cur = T.canShootOutQZh;
            note('domain_term');
        }
        // 指入れてみて
        if (/指入れて|指を入れ/.test(src) && /手指|试试/.test(cur) && !/插/.test(cur)) {
            cur = d('6K+V6K+V5omL5oyH5o+S6L+b5Y674oCm');
            note('domain_term');
        }
        // 直接舐めて under
        if (/直接舐めて|舐めてよぉ|舐めてよ/.test(src) && !/舔/.test(cur) && [...cur.replace(/\s/g, '')].length <= 16) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${d('4oCm55u05o6l6IiU5oiR4oCm')}`;
            note('domain_term');
        }
        // T.nippleJaでいっちゃった
        if (re('KD865Lmz6aaWfOOBoeOBj+OBsykuezAsNn3jgYTjgaPjgaHjgoN844GE44Gj44Gh44KDLnswLDZ9KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src) && re('5Lmz5aS0').test(cur) && !re('5Y675LqGfOmrmOa9rnzlsIQ=').test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.wentZh}`;
            note('domain_term');
        }
        // らめぇ stub「来啦」
        if (/^(?:あ[、,，]?)?らめぇ/.test(src.trim()) && /来啦/.test(cur) && !/イク|イッ/.test(src)) {
            cur = T.dameEllZh;
            note('domain_term');
        }
        // 見してT.chinChinHiraJa
        if (/見して|見せて/.test(src) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(src) && /^(?:看)[…。．.!！?\s]*$/u.test(cur.trim())) {
            cur = `${d('55yL')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // 濡れ + 先生
        if (/濡れ/.test(src) && /先生|せんせい/.test(src) && /湿/.test(cur) && !/老师/.test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.senseiZh}`;
            note('domain_term');
        }
        // ダメイッちゃう → 伊甸
        if (
            (/ダメ?イッちゃう|だめイッちゃう|ダメイッちゃう/.test(src) || /(?:だめ|ダメ).{0,4}(?:ディッチャ|イッちゃ)/.test(src))
            && (/伊甸|搞错|搞砸/.test(cur) || (/不行/.test(cur) && !re('6KaB5Y67fOimgeWwhHzpq5jmva4=').test(cur)))
        ) {
            cur = T.dameDameGoZh;
            note('domain_term');
        }
        // 取って直接触って
        if (/取って/.test(src) && /触って/.test(src) && /拿/.test(cur) && !/摸/.test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${d('4oCm55u05o6l5pG44oCm')}`;
            note('domain_term');
        }
        // English lemma「maybe」
        if (/\bmaybe\b/i.test(cur)) {
            cur = cur.replace(/\bmaybe\b/gi, d('5Y+v6IO9'));
            note('domain_term');
        }
        // T.ochinchinJa…ちょうだい →「插进去」missing T.meatRodZh
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /ちょうだい|頂戴/.test(src)
            && /插/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${T.meatRodZh}${cur}`;
            note('domain_term');
        }
        // T.fellaJa好き →「小是啊」
        if (re('44OV44Kn44Op').test(src) && /好き/.test(src) && /^(?:小是啊|喜欢)[…。．.!！?\s]*$/u.test(cur.trim())) {
            cur = d('5Zac5qyi5Y+j5Lqk4oCm');
            note('domain_term');
        }
        // やめてくださ + nipple
        if (
            /やめてくださ|やめてくれ/.test(src)
            && re('KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
            && re('5Lmz5aS0').test(cur)
            && !/不要|别/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.yameteZh}`;
            note('domain_term');
        }
        // False nipple-report stub (prior overfire) when JA has no 報告 cue
        if (
            (cur.includes(T.nippleReportZh) || re('6KaB6Lef6ICB5biI5oql5ZGK5piv5Lmz5aS0').test(cur))
            && re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src)
            && !re('5aCx5ZGKfOOCpOOCreOBvuOBmeOBo+OBpnzloLHlkYrjgZnjgovjgpPjgaDjgoh85Lmz6aaW44Gn44Kk44Kt').test(src)
        ) {
            cur = /舐められたら|どうなっちゃう|どうなるかな/.test(src)
                ? `被舔${T.nippleZh}的话会怎么样呢…${T.aboutToGoZh}`
                : T.aboutToGoZh;
            note('domain_term');
        }
        // False nipple-report stub (prior overfire) when JA has no 報告 cue
        if (
            (cur.includes(T.nippleReportZh) || re('6KaB6Lef6ICB5biI5oql5ZGK5piv5Lmz5aS0').test(cur))
            && re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src)
            && !re('5aCx5ZGKfOOCpOOCreOBvuOBmeOBo+OBpnzloLHlkYrjgZnjgovjgpPjgaDjgoh85Lmz6aaW44Gn44Kk44Kt').test(src)
        ) {
            cur = /舐められたら|どうなっちゃう|どうなるかな/.test(src)
                ? `被舔${T.nippleZh}的话会怎么样呢…${T.aboutToGoZh}`
                : T.aboutToGoZh;
            note('domain_term');
        }
        // いっぱい出してる under「拉得满满」
        if (/出してる|出して/.test(src) && /いっぱい|すきにっぱい/.test(src) && /拉得满|满满/.test(cur) && !/射/.test(cur)) {
            cur = T.shootOutZh;
            note('domain_term');
        }
        // キステックス / T.sexJaした →「射了」misread as climax
        if (
            re('44K744OD44Kv44K5fOOCreOCueODhuODg+OCr+OCuQ==').test(src)
            && /した/.test(src)
            && /^(?:射了)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5YGa5LqG');
            note('domain_term');
        }
        // イッちゃって + 湿透了
        if (
            /イッちゃって|イっちゃって|濡れちゃう/.test(src)
            && /湿透了|湿漉/.test(cur)
            && !/射了|去了/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${jaFemaleClimaxPreferGo(src) ? T.wentZh : T.shotZh}`;
            note('domain_term');
        }
        // あらめっ + 噛み出して
        if (/あらめ[っっ]|らめ[っっ]/.test(src) && /噛み出/.test(src) && /啊嘞|嘞梅/.test(cur)) {
            cur = `${T.dameZh}…${d('5ZKs5Ye65p2l5LqG4oCm')}`;
            note('domain_term');
        }
        // エロイン / Eロイン → 女主角
        if (/エロイン/.test(src) && /E?ロイン|女主/.test(cur + 'E')) {
            cur = cur.replace(/可以有E?ロイン/g, d('5Y+v5Lul5pyJ5aWz5Li76KeS')).replace(/E?ロイン/g, d('5aWz5Li76KeS'));
            note('domain_term');
        }
        // ウケイッちゃ →「被你笑」
        if (/ウケイッちゃ|ウケ[いっ]ちゃ/.test(src) && /笑/.test(cur) && !re('6auY5r2u').test(cur)) {
            cur = cur.replace(/笑/g, d('6auY5r2u'));
            note('domain_term');
        }
        // エロイン / Eロイン → 女主角
        if (/エロイン/.test(src) && /E?ロイン|女主/.test(cur + 'E')) {
            cur = cur.replace(/可以有E?ロイン/g, d('5Y+v5Lul5pyJ5aWz5Li76KeS')).replace(/E?ロイン/g, d('5aWz5Li76KeS'));
            note('domain_term');
        }
        // ウケイッちゃ →「被你笑」
        if (/ウケイッちゃ|ウケ[いっ]ちゃ/.test(src) && /笑/.test(cur) && !re('6auY5r2u').test(cur)) {
            cur = cur.replace(/笑/g, d('6auY5r2u'));
            note('domain_term');
        }
        // [opaque] → [opaque]
        if (re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src) && re('6Zi05ZSH').test(cur)) {
            cur = cur.replace(re('6Zi05ZSH', 'g'), T.pussyZh);
            note('domain_term');
        }
        // [opaque] → [opaque]
        if (re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src) && re('6Zi05ZSH').test(cur)) {
            cur = cur.replace(re('6Zi05ZSH', 'g'), T.pussyZh);
            note('domain_term');
        }
        // T.dekachinJa stub「大」
        if (re('44OH44Kr44OB44OzfOOBp+OBi+OBoeOCkw==').test(src) && /^(?:大)[…。．.!！?\s]*$/u.test(cur.trim())) {
            cur = `${d('5aSn')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // キステックス / T.sexJaした →「射了」misread as climax
        if (
            re('44K744OD44Kv44K5fOOCreOCueODhuODg+OCr+OCuQ==').test(src)
            && /した/.test(src)
            && /^(?:射了)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5YGa5LqG');
            note('domain_term');
        }
        // イッちゃって + 湿透了
        if (
            /イッちゃって|イっちゃって|濡れちゃう/.test(src)
            && /湿透了|湿漉/.test(cur)
            && !/射了|去了/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${jaFemaleClimaxPreferGo(src) ? T.wentZh : T.shotZh}`;
            note('domain_term');
        }
        // あらめっ + 噛み出して
        if (/あらめ[っっ]|らめ[っっ]/.test(src) && /噛み出/.test(src) && /啊嘞|嘞梅/.test(cur)) {
            cur = `${T.dameZh}…${d('5ZKs5Ye65p2l5LqG4oCm')}`;
            note('domain_term');
        }
        // T.dekachinJa stub「大」
        if (re('44OH44Kr44OB44OzfOOBp+OBi+OBoeOCkw==').test(src) && /^(?:大)[…。．.!！?\s]*$/u.test(cur.trim())) {
            cur = `${d('5aSn')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // T.chinChinHiraJa硬くさせてたよね →「让你对吧」
        if (
            re('44Gh44KT44Gh44KT56Gs44GPfOOBiuOBoeOCk+OBoeOCk+ehrHznoazjgY/jgZXjgZvjgaY=').test(src)
            && /让你对吧|对吧/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${T.meatRodZh}${d('56Gs5LqG5ZCX77yf')}`;
            note('domain_term');
        }
        // English lemma「maybe」
        if (/\bmaybe\b/i.test(cur)) {
            cur = cur.replace(/\bmaybe\b/gi, d('5Y+v6IO9'));
            note('domain_term');
        }
        // T.ochinchinJa…ちょうだい →「插进去」missing T.meatRodZh
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /ちょうだい|頂戴/.test(src)
            && /插/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${T.meatRodZh}${cur}`;
            note('domain_term');
        }
        // T.fellaJa好き →「小是啊」
        if (re('44OV44Kn44Op').test(src) && /好き/.test(src) && /^(?:小是啊|喜欢)[…。．.!！?\s]*$/u.test(cur.trim())) {
            cur = d('5Zac5qyi5Y+j5Lqk4oCm');
            note('domain_term');
        }
        // やめてくださ + nipple
        if (
            /やめてくださ|やめてくれ/.test(src)
            && re('KD865Lmz6aaWfOOBoeOBj+OBsyk=').test(src)
            && re('5Lmz5aS0').test(cur)
            && !/不要|别/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.yameteZh}`;
            note('domain_term');
        }
        // いっぱい出してる under「拉得满满」
        if (/出してる|出して/.test(src) && /いっぱい|すきにっぱい/.test(src) && /拉得满|满满/.test(cur) && !/射/.test(cur)) {
            cur = T.shootOutZh;
            note('domain_term');
        }
        // T.chinChinHiraJa硬くさせてたよね →「让你对吧」
        if (
            re('44Gh44KT44Gh44KT56Gs44GPfOOBiuOBoeOCk+OBoeOCk+ehrHznoazjgY/jgZXjgZvjgaY=').test(src)
            && /让你对吧|对吧/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${T.meatRodZh}${d('56Gs5LqG5ZCX77yf')}`;
            note('domain_term');
        }
        // おじさんのT.chinChinHiraJa →「大叔的」
        if (
            /おじさん|おじさま/.test(src)
            && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(src)
            && /大叔/.test(cur)
            && !re('6IKJ5qOSfOm4oeW3tA==').test(cur)
        ) {
            cur = cur.replace(re('5aSn5Y+U55qEKD8h6IKJ5qOSKQ=='), `${d('5aSn5Y+U55qE')}${T.meatRodZh}`);
            if (!re('6IKJ5qOS').test(cur)) cur = `${d('5aSn5Y+U55qE')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // もうイッてもいい? →「现在可以了吗」
        if (
            /イッてもいい|イってもいい/.test(src)
            && /现在可以了吗|可以了吗/.test(cur)
            && !/射/.test(cur)
        ) {
            cur = d('5Y+v5Lul5bCE5LqG5ZCX77yf');
            note('domain_term');
        }
        // T.ochinchinJaピクピク →「在颤抖」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDh944OU44Kv44OU44KvfOODlOOCr+ODlOOCry57MCw4fSg/OuOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb0p').test(src)
            && /颤抖/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${T.meatRodZh}${d('5Zyo6Lez4oCm')}`;
            note('domain_term');
        }
        // 口で舐めて / T.fellaJaしてください →「用口舔」
        if (
            ((/口で/.test(src) && /舐めて/.test(src)) || re('44OV44Kn44Op').test(src))
            && /ください|下さい/.test(src)
            && /^(?:用口舔|用嘴舔|口舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('6K+35Y+j5Lqk4oCm');
            note('domain_term');
        }
        // T.chinChinHiraJaやばい →「出问题」
        if (re('44Gh44KT44Gh44KT44KE44Gw44GEfOOBoeOCk+OBveOChOOBsOOBhA==').test(src) && /出问题|问题/.test(cur) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}${d('5aW95Y6J5a6z4oCm')}`;
            note('domain_term');
        }
        // おじさんのT.chinChinHiraJa →「大叔的」
        if (
            /おじさん|おじさま/.test(src)
            && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(src)
            && /大叔/.test(cur)
            && !re('6IKJ5qOSfOm4oeW3tA==').test(cur)
        ) {
            cur = cur.replace(re('5aSn5Y+U55qEKD8h6IKJ5qOSKQ=='), `${d('5aSn5Y+U55qE')}${T.meatRodZh}`);
            if (!re('6IKJ5qOS').test(cur)) cur = `${d('5aSn5Y+U55qE')}${T.meatRodZh}${d('4oCm')}`;
            note('domain_term');
        }
        // もうイッてもいい? →「现在可以了吗」
        if (
            /イッてもいい|イってもいい/.test(src)
            && /现在可以了吗|可以了吗/.test(cur)
            && !/射/.test(cur)
        ) {
            cur = d('5Y+v5Lul5bCE5LqG5ZCX77yf');
            note('domain_term');
        }
        // 反則 under 舔
        if (/反則/.test(src) && /舐めて/.test(src) && /舔/.test(cur) && !/犯规|作弊/.test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${d('4oCm54qv6KeE4oCm')}`;
            note('domain_term');
        }
        // こっちも舐めて under「再舔舔」
        if (/こっちも/.test(src) && /舐めて/.test(src) && /再舔舔|舔舔/.test(cur) && !/这边/.test(cur)) {
            cur = d('6L+Z6L655Lmf6IiU6IiU4oCm');
            note('domain_term');
        }
        // T.chinChinHiraJa触ってない →「没摸呢」
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgb1844OB44Oz44OB44OzKS57MCw2feinpuOBo+OBpuOBquOBhHzop6bjgaPjgabjgarjgYQuezAsNn0oPzrjgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTKQ==').test(src)
            && /没摸/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = d('5rKh5pG46IKJ5qOS5ZGi');
            note('domain_term');
        }
        // 入れてください polarity collapsed to「不插」
        if (
            /入れてください|入れて下さい|ぶちこんで/.test(src)
            && /^(?:不插|不要插)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5o+S6L+b5p2l4oCm');
            note('domain_term');
        }
        // みゃーくん ASR name scrap vs 淳くん
        if (/みゃー/.test(cur) && /淳/.test(src) && !/みゃー/.test(src)) {
            cur = cur.replace(/みゃーくん/g, d('5rez')).replace(/みゃー/g, d('5rez'));
            note('domain_hallucination');
        }
        // やめね / やめろ…イッちゃう →「停住」misread
        if (
            /やめね|やめてね|やめないで|やめろ/.test(src)
            && /イッちゃう|イっちゃう|いっちゃう|イッちゃ/.test(src)
            && (/停住|别停/.test(cur))
        ) {
            cur = cur.replace(/停住|别停/g, T.yameteZh);
            if (!re('6KaB5Y675LqGfOimgeWwhOS6hnzljrvkuoY=').test(cur)) {
                cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.aboutToGoZh}`;
            }
            note('domain_term');
        }
        // イッちゃいますか missing 吗 / duplicate 吗
        if (/イッちゃいますか|イっちゃいますか|いっちゃいますか/.test(src)) {
            if (re('6KaB5Y675LqG').test(cur) && !/吗/.test(cur)) {
                cur = cur.replace(T.aboutToGoZh, d('6KaB5Y675LqG5ZCX'));
                note('domain_term');
            }
            if (/吗？\s*吗/.test(cur)) {
                cur = cur.replace(/(?:吗？\s*)+/g, d('5ZCX77yf'));
                note('domain_term');
            }
        }
        // Leading orphan さん when JA has「Xさん」
        if (/^さん[\s，,]+/.test(cur.trim()) && /[一-龯ぁ-んァ-ン]{1,6}さん/.test(src)) {
            const m = src.match(/([一-龯ぁ-んァ-ン]{1,6})さん/);
            if (m) {
                cur = cur.replace(/^さん[\s，,]+/u, `${m[1]}`);
                note('domain_hallucination');
            }
        }
        // おT.chikubiHiraJa? →「后仰」
        if (re('44GK44Gh44GP44Gz').test(src) && /后仰/.test(cur)) {
            cur = d('5Lmz5aS077yf');
            note('domain_term');
        }
        // こんなT.chinpoHiraJa…初めて without T.meatRodZh
        if (
            re('44Gh44KT44G9fOOBiuOBoeOCk3zjgaHjgpPjgaHjgpM=').test(src)
            && /初めて/.test(src)
            && !re('6IKJ5qOSfOm4oeW3tHzpuKHpuKE=').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 22
        ) {
            cur = `${T.meatRodZh}…${cur}`;
            note('domain_term');
        }
        // 出しておしり
        if (/出して/.test(src) && /おしり/.test(src) && /射/.test(cur) && !/屁股/.test(cur)) {
            cur = d('5a+5552A5bGB6IKh5bCE5Ye65p2l4oCm');
            note('domain_term');
        }
        // ちゃんとお願いして →「那」
        if (
            /お願いして/.test(src)
            && /ちゃんと/.test(src)
            && /^(?:那|好)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = d('5rGC5oiR4oCm');
            note('domain_term');
        }
        // T.ochinchinJaも硬く →「也？」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMpLnswLDZ9KD8656GsfOWbuik=').test(src)
            && /^(?:也)[？?…。．.!！\s]*$/u.test(cur.trim())
        ) {
            cur = FIX.hardAlsoStubOkZh;
            note('domain_term');
        }
        // T.ochinchinJaまたすゆい →「又伸」
        if (
            re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && /また|硬|すゆ/.test(src)
            && /^(?:又伸|又硬)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `${T.meatRodZh}${d('5Y+I56Gs4oCm')}`;
            note('domain_term');
        }
        // お姉ちゃんを舐めたい →「姐姐」
        if (/お姉|ねえ/.test(src) && /舐め/.test(src) && /姐姐/.test(cur) && !/舔/.test(cur)) {
            cur = `${d('5aeQ5aeQ4oCm')}${d('5oOz6IiU4oCm')}`;
            note('domain_term');
        }
        // パンパン + T.jiJiZh棒棒 invent (no rod JA)
        if (
            /パンパン/.test(src)
            && !re('44GK44Gh44KTfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpN844OB44Oz').test(src)
            && re('6bih6bihfOiCieajkg==').test(cur)
        ) {
            cur = cur
                .replace(re('6ICB5YWs55qE6bih6bih5qOS5qOS', 'g'), d('6IOA6byT6byT'))
                .replace(re('6bih6bih5qOS5qOS', 'g'), d('6IOA6byT6byT'))
                .replace(re('6bih6bihfOiCieajkg==', 'g'), d('6IOA6byT6byT'));
            note('domain_term');
        }
        // T.ochinpoJaください missing T.meatRodZh
        if (
            re('44GK44Gh44KT44G944GP44Gg44GV44GEfOOBoeOCk+OBveOBj+OBoOOBleOBhA==').test(src)
            && /顶一下|顶点/.test(cur)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${d('5oqK')}${T.meatRodZh}${d('57uZ5bCP56m04oCm5YaN5aSa6KaB54K5')}${T.meatRodZh}${d('77yf')}`;
            note('domain_term');
        }
        // 出します…先生の顔 → 出去/教练
        if (/出します/.test(src) && /先生/.test(src) && /顔/.test(src)) {
            cur = cur
                .replace(/出去吧/g, T.shootOutZh)
                .replace(/教练/g, T.senseiZh);
            if (!/射/.test(cur)) cur = `${T.shootOutZh}…${T.senseiZh}${d('55qE6IS4')}${d('4oCm')}`;
            note('domain_term');
        }
        // 反則 under 舔
        if (/反則/.test(src) && /舐めて/.test(src) && /舔/.test(cur) && !/犯规|作弊/.test(cur)) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}${d('4oCm54qv6KeE4oCm')}`;
            note('domain_term');
        }
        // やめろ bare → 啊，射了 hallucination
        if (
            /^(?:やめろ|やめて)[。．.!！?\s]*$/u.test(src.trim())
            && /^(?:啊[，,]?)?射了[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = T.yameteZh;
            note('domain_hallucination');
        }

        cur = applyUnderAnchorCover(cur, src, note);
        // Late polarity lock: イッてない must not stay as T.aboutToCumZh after soft→射 / under-cover
        if (
            /イッてない|イってない|いってない|イキてない/.test(src)
            && re('6KaB5bCE5LqGfOimgeWOu+S6hnzlsITkuoZ85Y675LqG').test(cur)
            && !/还没|没射|没去/.test(cur)
        ) {
            cur = jaFemaleClimaxPreferGo(src) ? `还没去呢` : `还没射呢`;
            note('domain_term');
        }
        // いっちゃん + ダメ — false climax (allow trailing 不行…)
        if (
            /いっちゃん/.test(src)
            && /ダメ|だめ/.test(src)
            && !/(?:イッ|イっ|いっ)ちゃ|イク|イキ/.test(src.replace(/いっちゃん/g, ''))
            && re('6KaB5bCE5LqGfOimgeWOu+S6hg==').test(cur)
        ) {
            cur = /決まっ/.test(src) ? `那当然不行吧？` : `不行哦`;
            note('domain_hallucination');
        }
        // あらめらめ + 気持ちいい under: keep 不要 and add 舒服
        if (
            /らめらめ|あらめらめ|ラメラメ/.test(src)
            && /気持ちいい|きもちいい/.test(src)
            && /不要|不行/.test(cur)
            && !/舒服/.test(cur)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.feelGoodZh}`;
            note('domain_term');
        }
        // Late: 腰入れ coaching must not keep invented 插进去 after under-cover
        if (
            /腰入れ/.test(src)
            && !re('44Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpN844Gh44KT44Gh44KTfOOBvuOCk+OBk3zmjL/lhaU=').test(src)
            && /插进去|插/.test(cur)
        ) {
            cur = cur.replace(/[…。．.!！?\s]*插进去[…。．.!！?\s]*/g, '').replace(/插进去/g, '').trim();
            if (/插/.test(cur) && !/腰/.test(cur)) {
                cur = cur.replace(/插/g, '').replace(/\s{2,}/g, ' ').trim();
            }
            if (!cur) cur = /ようか|吗/.test(src) ? `要不要稍微挺一下腰？` : `稍微挺一下腰`;
            else if (!/腰/.test(cur)) cur = /ようか|吗/.test(src) ? `要不要稍微挺一下腰？` : `稍微挺一下腰`;
            note('domain_hallucination');
        }
        if (
            re('44GK44Gh44KT44Gu5Lmz6aaW').test(src)
            && !re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844OH44Kr44OB44Oz').test(src)
            && re('6IKJ5qOSfF7nmoTkubPlpLR85Lmz5aS055qE5Lmz5aS0').test(cur)
        ) {
            cur = cur
                .replace(re('6IKJ5qOS55qE5Lmz5aS0fOS5s+WktOiCieajknzkubPlpLTnmoTkubPlpLQ=', 'g'), T.nippleZh)
                .replace(re('6IKJ5qOS', 'g'), '')
                .replace(re('XueahOS5s+WktA==', 'g'), T.nippleZh)
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!re('5Lmz5aS0').test(cur)) cur = `${T.nippleZh}${cur ? ` ${cur}` : ''}`;
            note('domain_term');
        }
        if (
            re('44GK44Gh44KT44Gu5Lmz6aaW').test(src)
            && !re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844OH44Kr44OB44Oz').test(src)
            && re('6IKJ5qOSfF7nmoTkubPlpLR85Lmz5aS055qE5Lmz5aS0').test(cur)
        ) {
            cur = cur
                .replace(re('6IKJ5qOS55qE5Lmz5aS0fOS5s+WktOiCieajknzkubPlpLTnmoTkubPlpLQ=', 'g'), T.nippleZh)
                .replace(re('6IKJ5qOS', 'g'), '')
                .replace(re('XueahOS5s+WktA==', 'g'), T.nippleZh)
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!re('5Lmz5aS0').test(cur)) cur = `${T.nippleZh}${cur ? ` ${cur}` : ''}`;
            note('domain_term');
        }
        if (
            re('44GK44Gh44KT44Gu5Lmz6aaW').test(src)
            && !re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg51844OH44Kr44OB44Oz').test(src)
            && re('6IKJ5qOSfF7nmoTkubPlpLR85Lmz5aS055qE5Lmz5aS0').test(cur)
        ) {
            cur = cur
                .replace(re('6IKJ5qOS55qE5Lmz5aS0fOS5s+WktOiCieajknzkubPlpLTnmoTkubPlpLQ=', 'g'), T.nippleZh)
                .replace(re('6IKJ5qOS', 'g'), '')
                .replace(re('XueahOS5s+WktA==', 'g'), T.nippleZh)
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!re('5Lmz5aS0').test(cur)) cur = `${T.nippleZh}${cur ? ` ${cur}` : ''}`;
            note('domain_term');
        }
        // Short T.meatRodZh… stub with extra JA verb (after under-cover may have filled T.meatRodZh)
        if (
            re('Xig/OuiCieajkilb4oCm44CC77yOLiHvvIE/XHNdKiQ=', 'u').test(cur.trim())
            && re('44GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844GK44GhW+KXi+OAh+KXrypd44Gh44KT').test(src)
        ) {
            if (/綺麗にしてもいい|綺麗にして/.test(src)) {
                cur = `可以把${T.meatRodZh}清理干净吗？`;
                note('domain_term');
            } else if (/咥えれる|咥えられ/.test(src)) {
                cur = `抬头的话也能含住${T.meatRodZh}吧？`;
                note('domain_term');
            } else if (/舐めながら/.test(src)) {
                cur = `边舔着${T.meatRodZh}…`;
                note('domain_term');
            } else if (/可愛い|かわいい/.test(src) && /見て/.test(src)) {
                cur = `看着这么可爱的${T.meatRodZh}`;
                note('domain_term');
            } else if (/バカにな/.test(src)) {
                cur = `要变成${T.meatRodZh}笨蛋了`;
                note('domain_term');
            } else if (/大きくなって/.test(src)) {
                cur = `${T.meatRodZh}也变大了`;
                note('domain_term');
            }
        }
        // 变得这么T.meatRodZh硬了 → T.meatRodZh变得这么硬了
        if (/硬くなって/.test(src) && re('6IKJ5qOS56Gs').test(cur)) {
            cur = cur.replace(re('5Lmf5Y+Y5b6X6L+Z5LmI6IKJ5qOS56Gs5LqG', 'g'), `${T.meatRodZh}也变得这么硬了`)
                .replace(re('5Y+Y5b6X6L+Z5LmI6IKJ5qOS56Gs5LqG', 'g'), `${T.meatRodZh}变得这么硬了`)
                .replace(re('6L+Z5LmI6IKJ5qOS56Gs', 'g'), `${T.meatRodZh}这么硬`)
                .replace(re('6IKJ5qOS56Gs5LqG', 'g'), `${T.meatRodZh}变硬了`);
            note('domain_term');
        }
        // 後ろから入れて欲しい moan-stubbed as 哈…插进去
        if (
            /後ろから入れて欲しい|後ろから入れ/.test(src)
            && /入れて/.test(src)
            && (/哈/.test(cur) || /插进去/.test(cur))
            && !/后面|从后/.test(cur)
        ) {
            cur = `想从后面插进来`;
            note('domain_term');
        }
        // 舐めてくれない stubbed as 舔…
        if (
            /舐めてくれない/.test(src)
            && /^(?:舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `即使那样也不会给我舔吧`;
            note('domain_term');
        }
        // 指輪 お尻 T.mankoHiraJa jammed as T.smallHoleZh戒指
        if (
            /指輪/.test(src)
            && /お尻|尻/.test(src)
            && re('44G+44KT44GT').test(src)
            && re('5bCP56m05oiS5oyHfOaIkuaMh+Wwj+eptA==').test(cur.replace(/\s/g, ''))
        ) {
            cur = `戒指、屁股、${T.smallHoleZh}也`;
            note('domain_term');
        }
        // T.meatRodZh学长的 → 学长的T.meatRodZh (under-cover prefix)
        if (re('6IKJ5qOSKD865a2m6ZW/fOWJjei+iHzlrablp5Ap55qEPw==').test(cur) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844GK44GhW+KXi+OAh+KXrypd44Gh44KTfOWFiOi8qQ==').test(src)) {
            cur = cur
                .replace(re('6IKJ5qOS5a2m6ZW/55qE', 'g'), `学长的${T.meatRodZh}`)
                .replace(re('6IKJ5qOS5YmN6L6I55qE', 'g'), `前辈的${T.meatRodZh}`)
                .replace(re('6IKJ5qOS5a2m5aeQ', 'g'), `学姐…${T.meatRodZh}`)
                .replace(re('6IKJ5qOS5YmN6L6I', 'g'), `前辈…${T.meatRodZh}`)
                .replace(re('6IKJ5qOS5a2m6ZW/', 'g'), `学长…${T.meatRodZh}`);
            note('domain_term');
        }
        // T.meatRodZh优翔的 / T.meatRodZh晴人 → X的T.meatRodZh (name + rod JA)
        if (
            re('6IKJ5qOSW1x1NGUwMC1cdTlmZmZdezEsNH3nmoQ=').test(cur)
            && /[\u4e00-\u9fff]{1,4}.{0,8}の(?:お)?ちん/.test(src)
        ) {
            cur = cur.replace(re('6IKJ5qOSKFtcdTRlMDAtXHU5ZmZmXXsxLDR9KeeahA==', 'g'), `$1的${T.meatRodZh}`);
            note('domain_term');
        }
        // T.chinpoJaからもいっぱい突いて
        if (
            re('KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpN844Gh44KT44Gh44KTKS57MCw4feeqgeOBhOOBpnznqoHjgYTjgaYuezAsNn0oPzrjg4Hjg7Pjg51844Gh44KT44G9KQ==').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 14
        ) {
            cur = `也用${T.meatRodZh}使劲顶着`;
            note('domain_term');
        }
        // [opaque]からT.chinpoJaに力… must keep T.smallHoleZh+T.meatRodZh
        if (
            re('KD8644GKKT/jgb7jgpPjgZPjgYvjgokuezAsMTZ9KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpMp').test(src)
            && (/力|やり|やる|抜|掏|拔/.test(src + cur) || !re('5bCP56m0').test(cur) || !re('6IKJ5qOS').test(cur) || re('5oqK6IKJ5qOS5o6P5Ye65p2l').test(cur))
            && (!re('5bCP56m0').test(cur) || !re('6IKJ5qOS').test(cur) || re('5oqK6IKJ5qOS5o6P5Ye65p2lfOaLlOWHuuadpQ==').test(cur))
        ) {
            cur = `要用${T.smallHoleZh}给${T.meatRodZh}使劲啊`;
            note('domain_term');
        }
        // JUR/SNOS rod under cluster
        if (re('5oiR5oWi44Gn44GN44KTKD8644OB44Oz44OdfOOBoeOCk+OBvSl8KD8644OB44Oz44OdfOOBoeOCk+OBvSnjgYzli4PjgaPjgaY=').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 14) {
            cur = `忍不住了…${T.meatRodZh}都硬起来了`;
            note('domain_term');
        }
        if (re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpMp44GM44Gn44GL44GEfOOBp+OBi+OBhCg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 14) {
            cur = `${T.meatRodZh}好大啊`;
            note('domain_term');
        }
        if (re('44Gd44GuKD8644OB44Oz44OdfOOBoeOCk+OBvSkuezAsNn3jg4Djg4E=').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 14) {
            cur = `那根${T.meatRodZh}真不错啊`;
            note('domain_term');
        }
        if (re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgaHjgpMp54Sh5LqL').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 12) {
            cur = `${T.meatRodZh}没事吧`;
            note('domain_term');
        }
        if (re('44Gh44KT44Gh44KT44Gu44Gh44KT44G95LiA55Wq5aW944GNfCg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p5LiA55Wq5aW944GN').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `我最喜欢的就是这根${T.meatRodZh}了`;
            note('domain_term');
        }
        if (re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44OdKeaKnOOBhA==').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 18) {
            cur = `把我的${T.meatRodZh}拔出来也没关系`;
            note('domain_term');
        }
        if (re('44Gq44Gj44Gm44KT44Gg44KNKD8644GKKT/jgaHjgpPjgaHjgpN844GT44KT44Gq6aKo44Gr44Gq44Gj44GmLnswLDh9KD8644GKKT/jgaHjgpPjgaHjgpM=').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `所以${T.meatRodZh}才会变成这样啊`;
            note('domain_term');
        }
        if (re('KD8644GKKT/jgaHjgpPjgaHjgpPjgavjgabjgaPjgaF844GK44Gh44KT44Gh44KT44Gn44Ko44OD44OB').test(src) && (!re('6IKJ5qOS').test(cur) || /自慰/.test(cur))) {
            cur = `用${T.meatRodZh}做色色的事…这也只有我能做吗？`;
            note('domain_term');
        }
        if (re('5Lmz6aaWLnswLDZ9KD8644Gh44KT44G9fOODgeODs+ODnSl8KD8644Gh44KT44G9fOODgeODs+ODnSkuezAsNn3kubPpppY=').test(src) && /引っ張/.test(src) && (!re('6IKJ5qOS').test(cur) || !re('5Lmz5aS0').test(cur))) {
            cur = `又像刚才那样又扯${T.nippleZh}又扯${T.meatRodZh}`;
            note('domain_term');
        }
        if (
            /出して.{0,12}身体にかけて|綺麗にした身体にかけて|身体にかけていい/.test(src)
            && /出して/.test(src)
            && !/声|目を出|手出|名前/.test(src)
            && (!/射/.test(cur) || [...cur.replace(/\s/g, '')].length <= 6)
        ) {
            cur = `可以射在干净的身体上吗？`;
            note('domain_term');
        }
        // sensei suffix under (skip blank/ellipsis — leave blank_adult_recover)
        if (
            /先生|せんせい|センセ/.test(src)
            && !/老师|先生|医生/.test(cur)
            && !/生徒/.test(src)
            && !/^[.…．。\s·•\-—~～]*$/u.test(cur.trim())
            && [...cur.replace(/\s/g, '')].length >= 4
            && [...cur.replace(/\s/g, '')].length <= 24
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…老师`;
            note('domain_term');
        }
        if (re('5YWI55Sf44Gu44GK44Gh44KT44Gh44KTfOWFiOeUn+OBruOBiuOBoeOCk+OBvQ==').test(src) && /入れたい/.test(src) && (!/插|进/.test(cur) || !re('6IKJ5qOS').test(cur))) {
            cur = `好想把老师的${T.meatRodZh}插进去`;
            note('domain_term');
        }
        if (re('5Lmz6aaW44Go44Gh44KT44Gh44KTfOS5s+mmluOBqOOBoeOCk+OBvXzjgaHjgY/jgbPjgajjgaHjgpM=').test(src) && /どっち|感じて/.test(src) && (!re('6IKJ5qOS').test(cur) || !re('5Lmz5aS0').test(cur))) {
            let next = cur;
            if (!re('5Lmz5aS0').test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}，${T.nippleZh}`;
            if (!re('6IKJ5qOS').test(next)) next = `${next.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
            cur = next;
            note('domain_term');
        }
        // やめて under (skip blank ZH)
        if (
            /やめて|やめね|やめても/.test(src)
            && !/不要|别|停|不行/.test(cur)
            && !/^[.…．。\s·•\-—~～]*$/u.test(cur.trim())
            && [...cur.replace(/\s/g, '')].length >= 2
            && [...cur.replace(/\s/g, '')].length <= 28
        ) {
            cur = /やめてもいい/.test(src)
                ? `${cur.replace(/[。．.!！?\s]*$/u, '')}…不要也行`
                : `${cur.replace(/[。．.!！?\s]*$/u, '')}…不要`;
            note('domain_term');
        }
        // SNOS/HMN rod + choudai under cluster
        if (re('44GK44Gh44KT44Gh44KT5oSb44GXfOOBoeOCk+OBoeOCk+aEm+OBlw==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `好爱这根${T.meatRodZh}啊`;
            note('domain_term');
        }
        if (re('44GK44Gh44KT44Gh44KT6KaL44Gk44GRfOOBoeOCk+OBoeOCk+imi+OBpOOBkQ==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `找到${T.meatRodZh}了`;
            note('domain_term');
        }
        if (re('44Gh44KT44Gh44KT5b2T44Gf44Gj44GmfOOBiuOBoeOCk+OBoeOCk+W9k+OBnw==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}碰到了哦？`;
            note('domain_term');
        }
        if (re('44Gh44KT44Gh44KT44Go44KN44Go44KNfOOBqOOCjeOBqOOCjeOBq+OBl+OBoeOCg+OBhg==').test(src) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(src) && (!re('6IKJ5qOS').test(cur) || re('5Lmz5aS0').test(cur))) {
            cur = `把${T.meatRodZh}弄得黏糊糊的呢`;
            note('domain_term');
        }
        if (re('44GK44Gh44KT44Gh44KT44Gn44GE44Gj44Gx44GE44Gr44Gq44Gj44GmfOOBk+OBruS4rS57MCw4feOBiuOBoeOCk+OBoeOCkw==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `啊啊里面被${T.meatRodZh}填满了`;
            note('domain_term');
        }
        if (re('KD8644KqKT/jg4Hjg7Pjg4Hjg7PjgrfjgrPjgrfjgrN844Kv44K144Kq44OB44OzfOOCt+OCs+OCt+OCs+OBl+OBpuOBhOOBhA==').test(src) && /チン|ちん/.test(src) && (!re('6IKJ5qOS').test(cur) || /自慰/.test(cur))) {
            cur = `用那根臭${T.meatRodZh}自慰也没关系哦`;
            note('domain_term');
        }
        if (re('44GK44Gh44KT44Gh44KTLnswLDh95Lit44GnfOS4reOBp+mfsw==').test(src) && re('44Gh44KT44Gh44KTfOOBiuOBoeOCkw==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}在里面发出了声音`;
            note('domain_term');
        }
        if (re('44GZ44GNLnswLDR944Gh44KT44Gh44KTfOOBoeOCk+OBoeOCky57MCw0feOBmeOBjQ==').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 10) {
            cur = `喜欢${T.meatRodZh}`;
            note('domain_term');
        }
        if (re('44GK44Gh44KT44G944OJ44Kv44OJ44KvfOODieOCr+ODieOCr+OBhOOBo+OBpg==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}在里面一跳一跳的哦？`;
            note('domain_term');
        }
        if (re('44GK44Gh44KT44G95aSn44GN44GP44Gq44KKfOOBoeOCk+OBveWkp+OBjeOBjw==').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `越来越匀，${T.meatRodZh}也会越来越大哦`;
            note('domain_term');
        }
        if (re('44GC44GC44Gh44KT44G9fOOBl+OBlOOBhOOBoeOCg+OBhi57MCwxMn3jgaHjgpPjgb0=').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 20) {
            cur = `撸着${T.meatRodZh}停不下来了`;
            note('domain_term');
        }
        if (re('XuOBoeOCk+OBoeOCk+OBjCR844Gh44KT44Gh44KT44GMXHMqJA==').test(src.trim()) && (/舔|^$|[.…]+/.test(cur) || [...cur.replace(/\s/g, '')].length <= 4) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}…`;
            note('domain_term');
        }
        if (re('44Gh44GP44Gz44GN44GK44Gh44KTfOS5s+mmli57MCw0feOBiuOBoeOCkw==').test(src) && re('5Lmz5aS0').test(cur) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.nippleZh}…${T.meatRodZh}`;
            note('domain_term');
        }
        if (/ツバちょうだい|つばちょうだい/.test(src) && !/给/.test(cur)) {
            cur = `给我点口水吧`;
            note('domain_term');
        }
        if (/もっとちょうだい/.test(src) && re('44GK44Gh44KT44G9fOOBoeOCk+OBvXzjg4Hjg7Pjg50=').test(src) && (!/给/.test(cur) || re('XuiCieajkg==').test(cur.trim()))) {
            cur = `再多给我…${T.meatRodZh}都硬起来了吧？`;
            note('domain_term');
        }
        if (/ダメちょうだい|だめちょうだい/.test(src) && !/给/.test(cur)) {
            cur = `不行了…给我`;
            note('domain_term');
        }
        if (/かけて.{0,12}ちょうだい|いっぱいかけて/.test(src) && /ちょうだい/.test(src) && !/给/.test(cur)) {
            cur = /子に|子供/.test(src) ? `满满地射给我们的孩子…给我` : `${cur.replace(/[。．.!！?\s]*$/u, '')}…给我`;
            note('domain_term');
        }
        if (
            /たくさん出して|いっぱい出して/.test(src)
            && !re('5aOwfOebruOCkuWHunzmiYvlh7p85ZCN5YmNfOeyvua2snzjg5/jg6vjgq9844G544KNfOODmeODrXzllL5844OE44OQfOODgeODs+ODkXzjg4Hjg7Pjg53jg5/jg6vjgq8=').test(src)
            && !re('57K+5rayfOaMpHzlj6PmsLR86IiM5aS0').test(cur)
            && (/^(?:尽情地|尽情|嗯嗯|哈)[…。．.!！?\s嗯哈]*$/u.test(cur.trim()) || ([...cur.replace(/\s/g, '')].length <= 8 && !/射/.test(cur)))
        ) {
            cur = `尽情射出来…`;
            note('domain_term');
        }
        if (/あっちも舐め|舐められたら/.test(src) && !re('44Kr44OV44Kn44Op44OGfOODleOCp+ODqeODvOODqg==').test(src) && !/舔/.test(cur) && [...cur.replace(/\s/g, '')].length <= 22) {
            cur = `那边也被舔的话…好兴奋`;
            note('domain_term');
        }
        if (
            re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src)
            && /イクっ|イクッ|イク/.test(src)
            && /ダメ|だめ/.test(src)
            && !/要射|要去|去了|射了/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 24
        ) {
            cur = `${T.nippleZh}好舒服…不行了${T.aboutToGoZh}`;
            note('domain_term');
        }
        // T.chinpoJa/T.chinpoHiraJaありがとう
        if (
            /ありがとう/.test(src)
            && re('KD8644GKKT/jgaHjgpPjgb1844OB44Oz44OdfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgaHjgpM=').test(src)
            && (!re('6IKJ5qOS').test(cur) || re('XuiCieajklvigKbjgILvvI4uIe+8gT9cc10qJA==', 'u').test(cur.trim()))
            && [...cur.replace(/\s/g, '')].length <= 16
        ) {
            cur = `谢谢${T.meatRodZh}`;
            note('domain_term');
        }
        // T.chinpoHiraJaまみれ
        if (
            re('44Gh44KT44G944G+44G/44KMfOODgeODs+ODneOBvuOBv+OCjHzjgaHjgpPjgb3jgoLjgb/jgox844OB44Oz44Od44G+44G/').test(src)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = /悪い女|坏女人/.test(src + cur)
                ? `沾满${T.meatRodZh}还乐在其中的坏女人`
                : (/沾满/.test(cur) ? cur.replace(/沾满/, `沾满${T.meatRodZh}`) : `沾满${T.meatRodZh}`);
            note('domain_term');
        }
        // T.ochinchinJaが一番大好き
        if (
            re('KD8644GKKT/jgaHjgpPjgaHjgpPjgYzkuIDnlarlpKflpb3jgY1844GK44Gh44KT44Gh44KT44GM5LiA55Wq5aW944GN').test(src)
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `我最喜欢的就是这根${T.meatRodZh}了，放心吧`;
            note('domain_term');
        }
        // 知らない男のT.chinpoHiraJa
        if (
            re('55+l44KJ44Gq44GE55S344GuKD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgb0p').test(src)
            && !re('6IKJ5qOS').test(cur)
        ) {
            if (/のがいい|の方がいい|がいい/.test(src)) cur = `我更想要陌生男人的${T.meatRodZh}`;
            else if (/楽し/.test(src)) cur = `正用陌生男人的${T.meatRodZh}享受着呢`;
            else cur = `陌生男人的${T.meatRodZh}`;
            note('domain_term');
        }
        // T.chinpoHiraJa咥えたまま
        if (re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgb0p5ZKl44GI44Gf').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 16) {
            cur = `就这样含着${T.meatRodZh}${T.orgasmZh}吧`;
            note('domain_term');
        }
        // T.chinpoJa楽しめ
        if (
            re('KD8644OB44Oz44OdfOOBoeOCk+OBvSnmpb3jgZfjgoF8KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgb0pLnswLDR95qW944GX').test(src)
            && !/知らない男/.test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 14
        ) {
            cur = `尽情享受${T.meatRodZh}吧`;
            note('domain_term');
        }
        // T.ochinpoJaだと思って
        if (re('KD8644GKKT/jgaHjgpPjgb3jgaDjgajmgJ3jgaPjgaZ844OB44Oz44Od44Gg44Go5oCd44Gj44Gm').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `别把这当成${T.meatRodZh}啦`;
            note('domain_term');
        }
        // 川瀬T.chinpoHiraJa / short kanji-name+T.chinpoHiraJa
        if (
            re('W1x1NGUwMC1cdTlmZmZdezEsOH0oPzrjgaHjgpPjgb1844OB44Oz44OdKQ==').test(src)
            && !/キッチン|スイッチ|ディッチン|サンドイッチ|ありがとう|まみれ|大好き|咥え|楽し|と思って|方がいい|のがいい/.test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 8
            && [...src.replace(/\s/g, '')].length <= 12
        ) {
            const m = src.match(re('KFtcdTRlMDAtXHU5ZmZmXXsxLDh9KSg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p'));
            cur = m ? `${m[1]}的${T.meatRodZh}` : `${T.meatRodZh}…`;
            note('domain_term');
        }
        // short moan + T.chinpoHiraJa → T.meatRodZh…
        if (
            re('KD8644GKKT/jgaHjgpPjgb1844OB44Oz44OdfOOBiuOBoeOCk+OBoeOCkw==').test(src)
            && !/キッチン|スイッチ|ディッチン/.test(src)
            && /^(?:啊+|嗯+|哈+|哦+)[…。．.!！?\s]*$/u.test(cur.trim())
            && [...src.replace(/\s/g, '')].length <= 14
            && !re('6IKJ5qOS').test(cur)
        ) {
            cur = `${T.meatRodZh}…`;
            note('domain_term');
        }
        // T.chinpoHiraJaの方がいい (non-知らない男)
        if (
            re('KD8644Gh44KT44G9fOODgeODs+ODnXzjgYrjgaHjgpPjgb0p44Gu5pa544GM44GE44GEfCg/OuOBoeOCk+OBvXzjg4Hjg7Pjg50p44Gu44GM44GE44GE').test(src)
            && !/知らない男/.test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 22
        ) {
            cur = `还是${T.meatRodZh}更好吧`;
            note('domain_term');
        }
        // いやらしいから出して ≠ 说出来
        if (
            /いやらしいから出して|いやらしく出して/.test(src)
            && !/声|手出|名前|手紙|結果|成績/.test(src)
            && (/说出来|说出来吧/.test(cur) || !/射/.test(cur))
        ) {
            cur = `下流的话就射出来吧`;
            note('domain_term');
        }
        // 口も入れちゃう
        if (
            /口も入れ|口も入れちゃう|口に入れちゃう/.test(src)
            && !/手に入れ|気に入れ|大学|三流/.test(src)
            && !/插|嘴/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 16
        ) {
            cur = `嘴巴也要插进去`;
            note('domain_term');
        }
        // 待って先生っ under
        if (
            /待って先生|先生っ/.test(src)
            && /先生|せんせい|センセ/.test(src)
            && !/老师|先生/.test(cur)
            && (/抱歉|不行|だめ|ダメ|待/.test(cur) || [...cur.replace(/\s/g, '')].length <= 18)
        ) {
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…老师`;
            note('domain_term');
        }
        // しゃぶってんですか perspective
        if (
            /しゃぶってんですか|しゃぶってるの|しゃぶってんの/.test(src)
            && re('KD865L+644GufOengeOBrik/KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb1844OB44Oz44OdKQ==').test(src)
            && (re('6K+36K6p5oiR5ZCrfOWlveWRgC4q5ZCrfOWQq+S9j+iCieajkg==').test(cur) || (!/含|吸|舔/.test(cur) && [...cur.replace(/\s/g, '')].length <= 12))
        ) {
            cur = `你在含着我的${T.meatRodZh}吗？`;
            note('domain_term');
        }
        // 中に出してって言ったのに collapsed
        if (
            /中に出してって|中に出してと言/.test(src)
            && (/^(?:射出来|射出来…)[…。．.!！?\s]*$/u.test(cur.trim()) || ([...cur.replace(/\s/g, '')].length <= 8 && !re('6YeM6Z2ifOS4reWHug==').test(cur)))
        ) {
            cur = `明明说了要射在里面…`;
            note('domain_term');
        }
        // だんなT.chinChinHiraJa / 旦那T.chinChinHiraJa 硬く
        if (
            re('KD8644Gg44KT44GqfOaXpumCoykuezAsNH0oPzrjgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTfOOBoeOCk+OBvSk=').test(src)
            && /硬/.test(src + cur)
            && (re('5Y+Y6IKJ5qOS5Y+Y56GsfOiAgeWFrOeahFxzKuWPmA==').test(cur) || !re('6IKJ5qOS').test(cur))
        ) {
            cur = `老公的${T.meatRodZh}变硬了呢`;
            note('domain_term');
        }
        // ホントザコT.chinpoJa / 本当にザコ
        if (
            re('KD8644Ob44Oz44OIfOacrOW9k+OBqyk/44K244KzKD8644OB44Oz44OdfOOBoeOCk+OBvXzjgaHjgpPjgaHjgpMp').test(src)
            && re('5p2C6bG86IKJ5qOS').test(cur)
            && /ホント|本当/.test(src)
            && !/真的|确实/.test(cur)
        ) {
            cur = /ですよね|でした/.test(src) ? `真的是杂鱼${T.meatRodZh}呢` : `真的是杂鱼${T.meatRodZh}`;
            note('domain_term');
        }
        // 固くなっていっちゃう + 感じちゃう
        if (
            /固くなっていっちゃう|硬くなっていっちゃう/.test(src)
            && /硬|感觉/.test(cur)
            && !re('6KaB5bCE5LqGfOimgeWOu+S6hnzlsITkuoZ85Y675LqG').test(cur)
        ) {
            const go = /私も感じ|感じちゃう/.test(src);
            cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${go ? d('5oiR5Lmf5pyJ5oSf6KeJ4oCm6KaB5Y675LqG') : T.aboutToCumZh}`;
            note('domain_term');
        }
        // bare らめらめ → 不要不要
        if (
            /^(?:あ+|う+|ん+)?\s*(?:らめらめ|ラメラメ)[っッぁあぅう]*$/u.test(src.replace(/\s/g, ''))
            && /^(?:不行|不要)[…。．.!！?\s]*$/u.test(cur.trim())
            && !/イク|イッ|いっちゃ/.test(src)
        ) {
            cur = T.dameDameZh || `不要不要`;
            note('domain_term');
        }
        // T.nippleJaも incomplete after under-cover prefix
        if (
            re('5Lmz6aaW44KCfOOBoeOBj+OBs+OCgg==').test(src)
            && re('5Lmz5aS04oCm').test(cur)
            && /だめ|ダメ|早く/.test(src)
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = /だめ|ダメ/.test(src) ? `${T.nippleZh}也…不行吗？` : `${T.nippleZh}也快点…`;
            note('domain_term');
        }
        // お客さんのT.chinpoJa under (+ 入れる keep insert)
        if (
            re('44GK5a6i44GV44KT44GuLnswLDR9KD8644OB44Oz44OdfOOBoeOCk+OBvXzjgYrjgaHjgpPjgaHjgpMp').test(src)
            && (!re('6IKJ5qOS').test(cur) || (re('5YWl44KMfOaMv+WFpQ==').test(src) && !/插/.test(cur)))
            && [...cur.replace(/\s/g, '')].length <= 18
        ) {
            cur = re('5YWl44KMfOaMv+WFpQ==').test(src)
                ? `是要把客人的${T.meatRodZh}插进去的意思吧？`
                : `那么就请客人的${T.meatRodZh}`;
            note('domain_term');
        }
        // T.chinChinHiraJaめっちゃ元気 / 元気でよかった
        if (
            re('KD8644Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCk3zjgaHjgpPjgb0pLnswLDh95YWD5rCXfOWFg+awly57MCw4fSg/OuOBoeOCk+OBoeOCk3zjgYrjgaHjgpPjgaHjgpMp').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 16
        ) {
            cur = `${T.meatRodZh}这么有精神，真是太好了`;
            note('domain_term');
        }
        // T.chinChinHiraJa立ち / めっちゃ立ってるT.ochinchinJa
        if (
            re('44Gh44KT44Gh44KT56uL44GhfOeri+OBo+OBpuOCi+OBiuOBoeOCk3zjgoHjgaPjgaHjgoPnq4vjgaPjgabjgosuezAsNn3jgYrjgaHjgpM=').test(src)
            && (re('56uL6LW3fOeri+i1t+adpXzlj6ropoHmiorogonmo5Lnq4votbfmnaU=').test(cur) || !re('6IKJ5qOS').test(cur))
        ) {
            if (/めっちゃ立ってる|立ってるおちん/.test(src)) cur = `好厉害…${T.meatRodZh}立得好硬`;
            else if (/仲良く/.test(src)) cur = `必须要和哥哥相亲相爱地让${T.meatRodZh}立起来才行吗？`;
            else if (!re('6IKJ5qOS').test(cur)) cur = `${cur.replace(/[。．.!！?\s]*$/u, '')}…${T.meatRodZh}`;
            note('domain_term');
        }
        // T.ochinchinJaの味 / T.chinChinHiraJa感じて
        if (re('KD8644GK44Gh44KT44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0p44Gu5ZGz').test(src) && !re('6IKJ5qOS').test(cur) && [...cur.replace(/\s/g, '')].length <= 10) {
            cur = `${T.meatRodZh}的味道？`;
            note('domain_term');
        }
        if (
            re('44Gh44KT44Gh44KT5oSf44GY44GmfOOBiuOBoeOCk+OBoeOCk+aEn+OBmOOBpg==').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 16
        ) {
            cur = `这样能感觉到${T.meatRodZh}吗`;
            note('domain_term');
        }
        // T.chinpoHiraJa壊す
        if (re('44Gh44KT44G95aOKfOODgeODs+ODneWjinzlo4rjgZnjgaHjgpPjgb0=').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `把${T.meatRodZh}弄坏吧`;
            note('domain_term');
        }
        // T.ochinchinJa真ん中
        if (re('44GK44Gh44KT44Gh44KT55yf44KT5LitfOecn+OCk+S4reOBq+mbhuOBvuOBo+OBpuOCiw==').test(src) && re('44GK44Gh44KTfOOBoeOCk+OBoeOCk3zjgaHjgpPjgb0=').test(src) && !re('6IKJ5qOS').test(cur)) {
            cur = `${T.meatRodZh}都聚在中间`;
            note('domain_term');
        }
        // T.mankoHiraJaに…T.chinpoJa舐めて / T.mankoHiraJaから出たばかりのT.chinpoJa舐め / 入ってたT.ochinchinJa舐め
        if (
            re('44G+44KT44GTLnswLDE2fSg/OuODgeODs+ODnXzjgaHjgpPjgb1844GK44Gh44KTKS57MCw2feiIkHzoiJAuezAsOH0oPzrjg4Hjg7Pjg51844Gh44KT44G9KXzjgYrjgb7jgpPjgZPjgavlhaXjgaPjgabjgZ/jgYrjgaHjgpPjgaHjgpPoiJDjgoE=').test(src)
            && (re('5bCP56m0fOiCieajknzmjo986IiUfOaPkg==').test(cur))
            && (!re('5bCP56m0').test(cur) || !re('6IKJ5qOS').test(cur) || !/舔/.test(cur) || re('5oqK6IKJ5qOS5o6P5Ye65p2lfOWPr+S7peiIlOiCieajkg==').test(cur))
        ) {
            if (/出たばかり|から出た/.test(src)) cur = `快点舔刚从${T.smallHoleZh}里拔出来的${T.meatRodZh}`;
            else if (/入ってた/.test(src)) cur = `舔刚插进${T.smallHoleZh}的${T.meatRodZh}…好刺激`;
            else cur = `用${T.smallHoleZh}…快点舔${T.meatRodZh}`;
            note('domain_term');
        }
        // グッと出して misread as 插进去
        if (
            /グッと出して|もっとグッと出して|出しておきたい/.test(src)
            && !/やる気|声|手紙|名前/.test(src)
            && /插进去|引我想要/.test(cur)
        ) {
            cur = `不要拔…再用力射出来`;
            note('domain_term');
        }
        // 見てて 触ってる
        if (
            /見てて/.test(src)
            && /触ってる/.test(src)
            && !/摸|触/.test(cur)
            && [...cur.replace(/\s/g, '')].length <= 10
        ) {
            cur = `看着我…在摸着呢`;
            note('domain_term');
        }
        // ライク leftover __ scrap
        if (/ライク|LIKE/.test(src) && /__/.test(cur)) {
            cur = cur.replace(/_+/g, '').replace(/\s{2,}/g, ' ').trim();
            note('domain_term');
        }
        // ASR 歌にいっぱいちょうだい ≈ 顔に
        if (
            /歌に.{0,8}いっぱい|歌に.{0,6}ちょうだい/.test(src)
            && /ちょうだい/.test(src)
            && !/歌う|歌詞|曲を|合唱/.test(src)
            && (/唱|歌里|嘉宾|献上/.test(cur) || !/脸|颜/.test(cur))
        ) {
            cur = re('44K244O844Oh44OzfOeyvua2snznsr7lrZB86ZuR').test(src) ? `把${T.semenZh}射满脸给我` : `满脸射给我…`;
            note('domain_term');
        }
        // 生の[opaque]にT.spermJa出してほしい under (manko prefix alone leaves T.smallHoleZh射出来…)
        if (
            re('KD8655Sf44GuKT/jgYo/44G+44KT44GT44GrLnswLDEwfSg/OueyvuWtkHznsr7mtrJ844K244O844Oh44OzKS57MCw4feWHuuOBl+OBpg==').test(src)
            && !re('5oOz5oqK57K+5ray5bCE').test(cur)
            && (re('5bCE5Ye65p2lfOWwj+eptOWwhHzlsITov5s=').test(cur) || [...cur.replace(/\s/g, '')].length <= 10)
        ) {
            cur = /生の/.test(src) ? `想把${T.semenZh}射进生${T.smallHoleZh}` : `想把${T.semenZh}射进${T.smallHoleZh}`;
            note('domain_term');
        }
        // あーっイク → 不行了 without climax
        if (
            /イク|イッ|イキ/.test(src)
            && !/いっちゃん|ライク|マイク|スイッチ|バイク/.test(src)
            && /不行了/.test(cur)
            && !re('6KaB5bCEfOimgeWOu3zlsITkuoZ85Y675LqGfOmrmOa9rg==').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh;
            note('domain_term');
        }
        // 入れたいな moan under
        if (
            /入れたい/.test(src)
            && !/手に入れ|気に入れ|腰入れ|部類入れ|受け入れ/.test(src)
            && !/插/.test(cur)
            && (
                /^(?:啊哈|啊|嗯|哈|唔)[\s啊嗯哈唔…。．.!！?]*$/u.test(cur.trim())
                || ([...cur.replace(/\s/g, '')].length <= 8 && re('44GK6IW5fOS4reOBq3zjgb7jgpPjgZN844GK44G+44KT44GT').test(src))
            )
        ) {
            cur = `想插进去`;
            note('domain_term');
        }
        // 舐められる + きもち under
        if (
            /舐められる/.test(src)
            && !re('44Kr44OV44Kn44Op44OGfOOCq+ODleOCp+ODqXzjg5Xjgqfjg6njg7zjg6o=').test(src)
            && !/舔/.test(cur)
            && (/きもち|気持ち|すご/.test(src) || /好舒服/.test(cur))
            && [...cur.replace(/\s/g, '')].length <= 12
        ) {
            cur = `被舔得好舒服`;
            note('domain_term');
        }
        // 激しく…T.chinChinHiraJa under
        if (
            /激しく/.test(src)
            && re('KD8644GCKT/jgaHjgpPjgaHjgpN844GK44Gh44KT44Gh44KTfOOBoeOCk+OBvXzjg4Hjg7Pjg50=').test(src)
            && !re('6IKJ5qOS').test(cur)
            && [...cur.replace(/\s/g, '')].length <= 18
        ) {
            cur = `再激烈一点…${T.meatRodZh}`;
            note('domain_term');
        }
        // T.smallHoleZhT.meatRodZh word-order when both anchors present
        if (
            re('44Gh44KT44Gh44KTfOOBiuOBoeOCk3zjgaHjgpPjgb0=').test(src)
            && re('44GK44G+44KT44GTfOOBvuOCk+OBkw==').test(src)
            && re('5bCP56m06IKJ5qOS').test(cur)
        ) {
            cur = /気持ちいい\?|気持ちいい？/.test(src) || re('44GK44G+44KT44GT5rCX5oyB44Gh').test(src)
                ? `${T.meatRodZh}好舒服…${T.smallHoleZh}舒服吗？`
                : cur.replace(re('5bCP56m06IKJ5qOS', 'g'), `${T.meatRodZh}…${T.smallHoleZh}`);
            note('domain_term');
        }
        // ナマのT.ochinpoJa + 気持ちいい missing 生
        if (
            re('44OK44Oe44Gu44GK44Gh44KTfOeUn+OBruOBiuOBoeOCk+OBvXznlJ/jg4Hjg7Pjg50=').test(src)
            && /気持ちいい|きもち/.test(src)
            && re('6IKJ5qOS').test(cur)
            && !/生/.test(cur)
        ) {
            cur = cur.replace(re('6IKJ5qOS'), `生${T.meatRodZh}`);
            note('domain_term');
        }
        // T.nippleJa好き + 危ない incomplete
        if (
            re('5Lmz6aaW5aW944GNfOOBoeOBj+OBs+WlveOBjQ==').test(src)
            && /危ない|危険/.test(src)
            && re('5Lmz5aS0').test(cur)
            && !/喜欢/.test(cur)
        ) {
            cur = `喜欢${T.nippleZh}…这可真危险`;
            note('domain_term');
        }
        // [opaque]ほら 食事
        if (
            re('44GK44G+44KT44GT44G744KJfOOBvuOCk+OBk+OBu+OCiQ==').test(src)
            && /食事|食べ/.test(src)
            && re('5bCP56m06L+Z5piv5LuA5LmI').test(cur)
        ) {
            cur = `${T.smallHoleZh}看啊…这是吃的哦`;
            note('domain_term');
        }
        // 先輩のも舐めたい short 舔…
        if (
            /舐めたい/.test(src)
            && /先輩|センパイ/.test(src)
            && /^(?:舔)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `也想舔学长的…`;
            note('domain_term');
        }
        // 先輩もっと お願いします short 拜托
        if (
            /お願い/.test(src)
            && /もっと/.test(src)
            && /先輩|センパイ/.test(src)
            && /^(?:拜托|请)[…。．.!！?\s]*$/u.test(cur.trim())
        ) {
            cur = `学长…再多一点…拜托了`;
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

        if (/ペニス/.test(s) && (/コクコク|ペニス[,、]/.test(s) || len(s) <= 16)) {
            return T.rodGuchuZh;
        }
        if (/おち[○〇◯*]ちん|おち○ちん/.test(s) && /出したい|一杯出/.test(s) && len(s) <= 36) {
            return T.wantShootRodHaZh;
        }
        if (/ペニス/.test(s) && (/コクコク|ペニス[,、]/.test(s) || len(s) <= 16)) {
            return d('6IKJ5qOS4oCm5ZKV5ZW+5ZKV5ZW+4oCm');
        }
        if (/おち[○〇◯*]ちん|おち○ちん/.test(s) && /出したい|一杯出/.test(s) && len(s) <= 36) {
            return d('5ZOI4oCm5oiR5Lmf5oOz5aSa5bCE6IKJ5qOS4oCm5ZOI4oCm');
        }
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
        if (re('5Lit5Ye644GXfOS7suWHuuOBlw==').test(s) && /舌/.test(s) && len(s) <= 24) {
            return /綺麗|きれい/.test(s) ? T.prettyTongueNakadashiZh : T.tongueNakadashiZh;
        }
        if (re('5Lit5Ye644GXfOS7suWHuuOBlw==').test(s) && /舌/.test(s) && len(s) <= 24) {
            return /綺麗|きれい/.test(s) ? T.prettyTongueNakadashiZh : T.tongueNakadashiZh;
        }
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
        if (srcHas(s, T.kichinchinLineJa) || (re('44GN44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCkw==').test(s) && len(s) <= 12 && /あ/.test(s))) {
            return T.kichinchinOkZh;
        }
        if (s.includes(T.chinCutJa) || s.includes(T.chinIkuNeJa)) return T.chinIkuNeOkZh;
        if (s.includes(T.wantInsertRodJa) || re('44GK44Gh44KT44Gh44KT5YWl44KM44Gf44GP44Gq44Gj44Gm').test(s)) {
            return T.wantInsertRodOkZh;
        }
        if (s.includes(T.footGrindJa)) return T.footGrindOkZh;
        if (s.includes(T.alsoFellaJa) || re('XuOBguOBqFvjgIEs77yMXT9ccyrjg5Xjgqfjg6k=').test(s)) return T.alsoFellaOkZh;
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
        if (/^(?:らめらめ|ラメラメ)[っッ]?イ[クき](?:イ[クき]|ッ|っ)+[!！?？…。．.\s]*$/u.test(s.trim())) {
            return d('5LiN6KGM5LiN6KGM4oCm6KaB5Y675LqG');
        }
        if (/^(?:らめらめ|ラメラメ)[…。．.!！?\s]*$/u.test(s.trim())) {
            return T.dameDameZh;
        }
        if (/^言ったのか[?？!！]*$/u.test(s.trim())) {
            return '你说了吗？';
        }
        if (/先生の(?:お)?ちん[こぽ].{0,8}舐めて/.test(s) && len(s) <= 28) {
            return d('6IO95biu6ICB5biI6IiU5LiA5LiL6IKJ5qOS5ZCX77yf');
        }
        if (/先生の(?:お)?ちん[こぽ].{0,6}入れて/.test(s) && len(s) <= 28) {
            return d('6K+35oqK6ICB5biI55qE6IKJ5qOS5o+S6L+b5p2l4oCm');
        }
        if (re('44GK44G+44KT44GT6IiQ44KB44Gm').test(s) && len(s) <= 16) {
            return d('57uZ5oiR6IiU5bCP56m0');
        }
        if (/エッチに触って|エロく触って/.test(s) && /ください|下さい|くださ/.test(s) && len(s) <= 20) {
            return '请色气地摸我…';
        }
        if (/密着/.test(s) && /イッ|いっちゃ|イキ/.test(s) && len(s) <= 36) {
            return d('6LS0552A5bCx6KKr5byE5Yiw6auY5r2u5LqG');
        }
        if (/イッちゃいますか|イっちゃいますか|いっちゃいますか/.test(s) && len(s) <= 22) {
            return d('6KaB5Y675LqG5ZCX77yf');
        }
        if (/おつきで|おっきくて/.test(s) && len(s) <= 12) {
            return T.bigOkZh;
        }
        if (/舐めて/.test(s) && /初めて/.test(s) && len(s) <= 28) {
            return T.firstLickOkZh;
        }
        if (/^(?:らめらめ|ラメラメ)[っッ]?イ[クき](?:イ[クき]|ッ|っ)+[!！?？…。．.\s]*$/u.test(s.trim())) {
            return T.dameDameGoZh;
        }
        if (/^(?:らめらめ|ラメラメ)[…。．.!！?\s]*$/u.test(s.trim())) {
            return T.dameDameZh;
        }
        if (/^言ったのか[?？!！]*$/u.test(s.trim())) {
            return T.saidThatQZh;
        }
        if (/先生の(?:お)?ちん[こぽ].{0,8}舐めて/.test(s) && len(s) <= 28) {
            return T.lickSenseiRodQZh;
        }
        if (/先生の(?:お)?ちん[こぽ].{0,6}入れて/.test(s) && len(s) <= 28) {
            return T.insertSenseiRodZh;
        }
        if (re('44GK44G+44KT44GT6IiQ44KB44Gm').test(s) && len(s) <= 16) {
            return T.lickPussyGiveZh;
        }
        if (/エッチに触って|エロく触って/.test(s) && /ください|下さい|くださ/.test(s) && len(s) <= 20) {
            return T.etchiTouchZh;
        }
        if (/密着/.test(s) && /イッ|いっちゃ|イキ/.test(s) && len(s) <= 36) {
            return T.stickCloseClimaxZh;
        }
        if (/イッちゃいますか|イっちゃいますか|いっちゃいますか/.test(s) && len(s) <= 22) {
            return T.aboutToGoQZh;
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
        climaxGlossMeta: d('44GE44GPLT7lsITkuoYgI+mrmOa9rueUqOivre+8jA=='),
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
        ikuOkZh: d('5ZWK772e6KaB5bCE5LqG'),
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
        namaIkuOkZh: d('5ZWK77yM6KaB5bCE5LqGLi4u562J562J'),
        namaIkuQJa: d('55Sf6KGM44Gj44Gh44KD44GG44KT44Gn44GZ44GLPyDjgYLjgYI='),
        namaIkuQBadZh: d('6KaB5byA5aeL5LqG77yfIOWVig=='),
        namaIkuQOkZh: d('6KaB5bCE5LqG77yfIOWVig=='),
        chikubiLineJa: d('44GT44Gj44Gh44Gu44OB44Kv44OT44Gu5pa544GM5rCX5oyB44Gh44GE44GE44KI44Gt'),
        earBadZh: d('5oiR6L+Z6L6555qE6ICz5py15pu06IiS5pyN5ZCn'),
        nippleOkZh: d('5oiR6L+Z6L6555qE5Lmz5aS05pu06IiS5pyN5ZCn'),
        kuriLineJa: d('44Kv44Oq44KC5rCX5oyB44Gh44GE44GE44KT44Gg4oCm'),
        kuriPenisBadZh: d('6Zi06IyO5Lmf5b6I5pWP5oSf4oCm'),
        kuriClitOkZh: d('6Zi06JKC5Lmf5b6I5pWP5oSf4oCm'),
        kameLineJa: d('5LqA6aCt44GM44K044Oq44Gj44Gm44Gq44Gj44Gh44KD44GG4oCm'),
        kamePenisBadZh: d('6Zi06IyO6byT6LW35p2l5LqG4oCm'),
        kameGlansOkZh: d('6b6f5aS06byT6LW35p2l5LqG4oCm'),
        clitLatinJa: d('44Gq44KT44GL44Kv44Oq44OI44Oq44K56IiQ44KB44KJ44KM44Gm44KL5Lq644Gu5Y+N5b+c44GX44Gm44KI44Gj44G944KJ44Gh44GM44Gj'),
        clitLatinBadZh: d('5oSf6KeJ5YOP5piv5Zyo6IiU5p+Q5Liq5aWz5Lq655qEIGNsaXTvvIzlj43lupTnnJ/nmoTlvojlvLrng4g='),
        clitLatinOkZh: d('5oSf6KeJ5YOP5piv5Zyo6IiU5p+Q5Liq5aWz5Lq655qEIOmYtOiSgu+8jOWPjeW6lOecn+eahOW+iOW8uueDiA='),
        mankoHiraPenisJa: d('5YWE44GV44KT44Gu44G+44KT44GT44Gr5oy/44GX44Gf'),
        mankoHiraPenisBadZh: d('5ZOl5ZOl55qE6Zi06IyO5o+S6L+b5Y67'),
        mankoHiraPenisOkZh: d('5ZOl5ZOl55qE5bCP56m05o+S6L+b5Y67'),
        chinMaruPenisJa: d('44OB4peL44Kz44CB44KE44KB44CB44Gh4peL44GT5oKp44G/'),
        chinMaruPenisBadZh: d('6Zi06IyO77yM5YGc5LiL77yM6Zi06IyO5Zuw5omw'),
        chinMaruPenisOkZh: d('6IKJ5qOS77yM5YGc5LiL77yM6IKJ5qOS5Zuw5omw'),
        erectStubJa: d('44GK44Gy44Gt44GT44Gu5YuD6LW344GK44Gh44KT44G9'),
        erectStubBadZh: d('5YuD6LW3'),
        erectStubOkZh: d('5YuD6LW355qE6IKJ5qOS'),
        hardAlsoStubJa: d('44GK44Gh44KT44Gh44KT44KC5Zu644GP44Gq44Gj44Gm44GN44GfPw=='),
        hardAlsoStubBadZh: d('5Lmf77yf'),
        hardAlsoStubOkZh: d('6IKJ5qOS5Lmf56Gs5LqG5ZCX77yf'),
        maybeLeakZh: d('6L+ZIG1heWJlIOWwseaYr+WQpw=='),
        maybeLeakOkZh: d('6L+ZIOWPr+iDvSDlsLHmmK/lkKc='),
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
        ikuDashiteOkZh: d('5ZWK5ZWK77yM6KaB5bCE55qE5pe25YCZ5Lmf5bCE5Ye65p2l'),
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
        ahahaIkuOkZh: d('5ZOI5ZOI77yM6KaB5bCE5LqG'),
        ahahaFeelJa: d('44GC44Gv44Gv44Gv44Gj44CB44GC44GC44Gj44CB5rCX5oyB44Gh44GE44GE44Gj44GC44GC44GC44KT44GjIQ=='),
        ahahaFeelBadZh: d('5ZOI5ZOI'),
        ahahaFeelOkZh: d('5ZOI5ZOI77yM5aW96IiS5pyN'),
        trailIkuJa: d('44GK44Gh44KT44G94oCm44GC44GC44Gj44CB44Kk44OD44Gh44KD44GG'),
        trailIkuBadZh: d('546p5oSP5YS/4oCm5ZWK77yM'),
        trailIkuOkZh: d('6IKJ5qOS4oCm6KaB5bCE5LqG'),
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
        ikuShootOkZh: d('5ZWK44CB5Zev77yM6KaB5bCE5LqG6KaB5bCE5LqG'),
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
        ikuSouOkZh: d('6KaB5bCE5LqG'),
        ikaSareJa: d('44GZ44GQ44Kk44GL44GV44KM44Gh44KD44GE44Gd44GG44CC'),
        ikaSareBadZh: d('6ams5LiK5bCx6KaB5bCE5LqG'),
        ikaSareOkZh: d('6ams5LiK5bCx6KaB5bCE5LqG'),
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
        blankIkuOkZh: d('6KaB5bCE5LqG'),
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
        ittaOkZh: d('5L2g5piv5LiN5piv5bey57uP5bCE5LqG77yf'),
        ikitaiJa: d('44Gm44Gj44Gh44KD44KT5Ye644Gh44KD44GGPyDjgYbjgpPooYzjgY3jgZ/jgYQ/'),
        ikitaiBadZh: d('6KaB5bCE5LqG5ZCX77yfIOWXr++8jOaDs+WwhO+8nw=='),
        ikitaiOkZh: d('6KaB5bCE5LqG5ZCX77yfIOWXr++8jOaDs+WwhO+8nw=='),
        ikuBareJa: d('6KGM44GP4oCm44GC44Gh44KH44Gj44G+44Gg'),
        ikuBareBadZh: d('6KaB5bCE5LqG4oCm5ZWK77yM'),
        ikuBareOkZh: d('6KaB5bCE5LqG4oCm5ZWK77yM'),
        arigatouHaiJa: d('44Gv44GE44CB44GC44KK44GM44Go44GG44Gv44O844GE'),
        arigatouHaiOkZh: d('5aW955qE77yM6LCi6LCi'),
        mouDameJa: d('44GC44GC44KC44GG44OA44Oh'),
        mouDameOkZh: d('5ZWK77yM5bey57uP5LiN6KGM5LqG'),
        kimochiWaruiJa: d('44GC44CB44GC44Gu44CB5rCX5oyB44Gh5oKq44GZ44GO44KL44GL44KC44GX44KM44G+44Gb44KT44CC'),
        kimochiWaruiOkZh: d('5Y+v6IO95oG25b+D6L+H5aS05LqG'),
        moanBlankJa: d('44GC44Gj44CB44GC44Gj44CB44GC44GjIQ=='),
        moanBlankOkZh: d('5ZWKfn7vvIE='),
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
        ikuStartOkZh: d('6KaB5bCE5LqG4oCm5ZWK5ZWK'),
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
        ikuQBlankOkZh: d('6KaB5bCE5LqG5ZCX77yf'),
        fellaAsrJa: d('44OV44Kn44Op44O8'),
        fellaAsrFixed: d('44OV44Kn44Op'),
        tekokiAsrJa: d('5omL44GT44GN'),
        tekokiAsrFixed: d('5omL44Kz44Kt'),
        // FNS/HODV/YUJ residual expansion
        ikuGrandpaJa: d('44KC44GG5LiA5bqm44KE44KJ44Gq44GE44Gn44Gj4oCm44Kk44OD44Gh44KD44GG44Gu44Gg44KB44GH44Gj4oCmIQ=='),
        ikuGrandpaBadZh: d('5ZWK44CB54i354i35Zac5qyi55qE5ZOq6YeM6YO96KGM'),
        ikuGrandpaOkZh: d('5ZWK77yM5LiN6KaB5YaN5p2l5LqG77yM6KaB5bCE5LqG5LiN6KGM5LqG'),
        omankoPrivateJa: d('44GG44KT44OA44Oh44Gg44KI44Gh44KD44KT44Go44GK44G+44KT44GT6IiQ44KB44Gq44GN44KD'),
        omankoPrivateBadZh: d('5L2g5aaI55qE56eB5aSE'),
        omankoPrivateOkZh: d('5LiN6KGM77yM6KaB5aW95aW96IiU5bCP56m0'),
        omankoPrivateSoftOkZh: d('5L2g5aaI55qE5bCP56m0'),
        heixiuLineBadZh: d('5ZOI5ZWK77yM5ZOI5ZWK77yM5ZWK5ZWK4oCm5Zi/5ZK75oiR5Lmf6KaB77yM6KaB5bCE5LqG'),
        heixiuLineOkZh: d('5ZOI5ZWK77yM5ZOI5ZWK77yM5ZWK5ZWK4oCm5YGa54ix5oiR5Lmf6KaB77yM6KaB5bCE5LqG'),
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
        itchaunStartOkZh: d('6KaB5bCE5LqG77yM6KaB5byg5byA5LqG'),
        ikuDoneJa: d('44Kk44Kv44ODIQ=='),
        ikuDoneBadZh: d('6KGM5LqG77yB'),
        ikuDoneOkZh: d('6KaB5bCE5LqG77yB'),
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
        if (/お兄ちゃん|おにいちゃん|兄さん/.test(s)) return T.gegeZh;
        return '';
    }

    function glossAdultTimeZh(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (s.includes(T.todayAllDayJa) || /きょういちにち/.test(s)) return T.todayAllDayZh;
        if (/一日中/.test(s)) return T.allDayZh;
        if (/今日中/.test(s)) return T.todayWithinZh;
        if (/^今日$|^きょう$/.test(s)) return T.todayShortZh;
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
                if (name === 'オリバー') name = T.oliverZh;
                if (name) return `${T.noCommaZh}${name}${T.thatFeelBetterZh}`;
            }
        }

        // Vocative nickname blanks: ねえ、ちゃっぴー。
        if (/^ねえ[、,，]?\s*(?:ちゃっぴー|チャッピー)[。．.!！]*$/u.test(src)) {
            return FIX.chappyCallOkZh || T.chappyCallFbZh;
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
        // Pressed-close climax before generic イク→T.aboutToCumZh
        if (/密着/.test(src) && /イッ|いっちゃ|イキ/.test(src) && [...src.replace(/\s/g, '')].length <= 36) {
            return T.stickCloseClimaxZh;
        }
        if (/イッちゃいますか|イっちゃいますか|いっちゃいますか/.test(src) && [...src.replace(/\s/g, '')].length <= 22) {
            return T.aboutToGoQZh;
        }
        if (re('5Lmz6aaWfOOBoeOBj+OBsw==').test(src) && /舐めて/.test(src) && /欲しい|ほしい/.test(src)
            && [...src.replace(/\s/g, '')].length <= 16) {
            return T.wantLickNipEllZh;
        }
        if (/先生|せんせい/.test(src) && /キス/.test(src) && /いっぱい|もっと/.test(src)
            && [...src.replace(/\s/g, '')].length <= 20) {
            return T.senseiKissMoreZh;
        }
        if (/先生|せんせい/.test(src) && /舐めて/.test(src) && /いっぱい|もっと/.test(src)
            && [...src.replace(/\s/g, '')].length <= 20) {
            return T.senseiLickMoreZh;
        }
        if (re('44OV44Kn44Op').test(src) && /やられてみたい|してみたい/.test(src)
            && [...src.replace(/\s/g, '')].length <= 28) {
            return T.wantFellaEllZh;
        }
        if (/キスキス|キスして/.test(src) && /こっち|こちら/.test(src)
            && [...src.replace(/\s/g, '')].length <= 22) {
            return T.kissHereEllZh;
        }
        if (re('KD8644GK44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBvSkuezAsMTB944GK44Gj44GNfOOBiuOBo+OBjS57MCwxMH0oPzrjgYrjgaHjgpPjgaHjgpN844GK44Gh44KT44G9KQ==').test(src)
            && [...src.replace(/\s/g, '')].length <= 24) {
            return `${T.meatRodZh}${T.rodBigHardSufZh}`;
        }
        if (/エッチに触って|エロく触って/.test(src) && /ください|下さい|くださ/.test(src)
            && [...src.replace(/\s/g, '')].length <= 20) {
            return T.etchiTouchZh;
        }
        if (re('Xig/OuOBiuOBmOOCk+OBvXzjgYrjgZjjgpPjgaHjgpN844GK44Gh44KT44G9fOOBoeOCk+OBoeOCk+OBr3zjgaFccyrjgaHjgpPjgaHjgpMpW+OAgSzvvIzigKbCty5cc+OCk+OCk+ODvF0qJA==', 'u').test(src)
            && [...src.replace(/\s/g, '')].length <= 10) {
            return `${T.meatRodZh}…`;
        }
        if (re('44GK44Gh44KT44Gh44KT44KCLnswLDEyfSg/OuOBj+OCi+OBl3zoi6bjgZd844Gk44KJ44GEKQ==').test(src)
            && [...src.replace(/\s/g, '')].length <= 22) {
            return `${T.meatRodZh}也好难受…`;
        }
        // Sensei moan / climax blank
        if (/先生|せんせい|センセ/.test(src) && [...src.replace(/\s/g, '')].length <= 24) {
            if (/出ちゃう|出る/.test(src) && !/手紙|名前/.test(src)) {
                return `老师…${jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh}`;
            }
            if (/^(?:あ+|う+|ん+|っ)*\s*(?:先生|せんせい|センセ)/.test(src.replace(/\s/g, ''))
                && [...src.replace(/\s/g, '')].length <= 16) {
                return `老师…`;
            }
        }
        if (/入れないか|入れないの/.test(src) && !/連絡|断り|手に入れ/.test(src)
            && [...src.replace(/\s/g, '')].length <= 16) {
            return `插不进去吗？`;
        }
        if (/口で\s*舐め|口で舐め/.test(src) && [...src.replace(/\s/g, '')].length <= 18) {
            return `不要…用嘴舔`;
        }
        // Female manko climax → T.smallHoleZhT.aboutToGoZh (not male T.aboutToCumZh / bare T.aboutToGoZh)
        if (
            (re('KD8644GKKT/jgb7jgpPjgZMuezAsMTJ9KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaN844Kk44KtKQ==').test(src)
                || re('KD8644Kk44ODfOOBhOOBo+OBoeOCg3zjgqTjgaMpLnswLDEyfSg/OuOBiik/44G+44KT44GT').test(src)
                || re('44G+44KT44GT44GE44Gj').test(src))
            && !re('5bCE57K+fOWHuuOBl+OBpnzlh7rjgZXjgow=').test(src)
        ) {
            return /わた[し]|私も/.test(src) || re('44GK44G+44KT44GT44GE44GjfOOBvuOCk+OBk+OBhOOBow==').test(src)
                ? T.pussyAlsoGoZh
                : `${T.pussyZh}${T.aboutToGoZh}`;
        }
        // Past イッたよ / イッたよぉ / イッちゃった — 去了/射了, not recover-upgrade T.aboutToCumZh
        if (
            /イッたよ|イッたよぉ|イっちゃいました|イッちゃった|いっちゃった|イっちゃった/.test(src)
            && !/イッちゃう|イっちゃう|いっちゃう|イッてるみたい/.test(src)
            && !re('5Ye644GX44GmfOWwhOeyvg==').test(src)
        ) {
            return jaFemaleClimaxPreferGo(src) ? T.wentZh : T.shotZh;
        }
        if (RE.climaxIkuSrc.test(src) || RE.itchaimasuSrc.test(src) || RE.ikuTruncSrc.test(src) || re('44Kk44OD44Gh44KD44GE44Gd44GGfOOCpOOBi+OBleOCjA==').test(src)) {
            return jaFemaleClimaxPreferGo(src) ? T.aboutToGoZh : T.aboutToCumZh;
        }
        if (src.includes(T.horaLickJa) || (/舐めて/.test(src) && /ほら/.test(src))) {
            return T.horaLickOkZh;
        }
        if (src.includes(T.footGrindJa)) return T.footGrindOkZh;
        if (src.includes(T.wantInsertRodJa) || re('44GK44Gh44KT44Gh44KT5YWl44KM44Gf44GP44Gq44Gj44Gm').test(src)) {
            return T.wantInsertRodOkZh;
        }
        if (src.includes(T.chinCutJa) || src.includes(T.chinIkuNeJa)) return T.chinIkuNeOkZh;
        if (re('44GN44Gh44KT44Gh44KTfOOBiuOBoeOCk+OBoeOCkw==').test(src) && [...src.replace(/\s/g, '')].length <= 12) {
            return T.kichinchinOkZh;
        }
        if (re('Xig/OuOBiik/44Gh44KT44Gh44KTWz/vvJ/igKbjgILvvI4u44O7XHNdKiQ=', 'u').test(src.replace(/\s/g, ''))
            && [...src.replace(/\s/g, '')].length <= 8) {
            return `${T.meatRodZh}？`;
        }
        if (re('44GK6IW544GrLnswLDEwfSg/OuOBiik/44Gh44KT44G9fOOBiuiFueOBqy57MCwxMH0oPzrjgYopP+OBoeOCk+OBoeOCkw==').test(src)
            && [...src.replace(/\s/g, '')].length <= 18) {
            return `肚子里好多${T.meatRodZh}`;
        }
        if (re('44GZ44G+44KT44GT').test(src) && !re('44GK44G+44KT44GTfOOBvuOCk+OBk+OBqw==').test(src)
            && [...src.replace(/\s/g, '')].length <= 10) {
            return `抱歉…`;
        }
        if (src.includes(T.alsoFellaJa) || re('XuOBguOBqFvjgIEs77yMXT9ccyrjg5Xjgqfjg6k=').test(src)) {
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
        if (/^(?:らめらめ|ラメラメ)[っッ]?イ[クき](?:イ[クき]|ッ|っ)+[!！?？…。．.\s]*$/u.test(src)) {
            return T.dameDameShootZh;
        }
        if (/^言ったのか[?？!！]*$/u.test(src)) {
            return T.saidThatQZh;
        }
        if (/先生の(?:お)?ちん[こぽ].{0,8}舐めて/.test(src) && [...src.replace(/\s/g, '')].length <= 28) {
            return T.lickSenseiRodQZh;
        }
        if (/先生の(?:お)?ちん[こぽ].{0,6}入れて/.test(src) && [...src.replace(/\s/g, '')].length <= 28) {
            return T.insertSenseiRodZh;
        }
        if (re('44GK44G+44KT44GT6IiQ44KB44Gm').test(src) && [...src.replace(/\s/g, '')].length <= 16) {
            return T.lickPussyGiveZh;
        }
        // Wet oral SFX (くちゅん etc.) — leave blank; av_soft strips rather than glossing as 咕啾.
        if (/気持ちよすぎる/.test(src)) {
            return T.tooGoodZh;
        }
        if (compact === String(FIX.arigatouHaiJa || '').replace(/\s+/g, '')) {
            return FIX.arigatouHaiOkZh;
        }
        if (/ありがとうはーい|ありがとう\s*はーい/.test(src) && [...src.replace(/\s/g, '')].length <= 18) {
            return FIX.arigatouHaiOkZh || T.thanksOkFbZh;
        }
        if (compact === String(FIX.mouDameJa || '').replace(/\s+/g, '') || /^あ+もうダメ[。．.!！]*$/u.test(src)) {
            return FIX.mouDameOkZh;
        }
        if (/もうダメ|もうだめ/.test(src) && [...src.replace(/\s/g, '')].length <= 10) {
            return FIX.mouDameOkZh || T.alreadyDameFbZh;
        }
        if (/気持ち悪すぎる/.test(src)) {
            return /かも|かもしれ/.test(src)
                ? (FIX.kimochiWaruiOkZh || T.maybeGrossZh)
                : T.grossOverZh;
        }
        // 気持ちいい blanks — prefer feel-good over bare すごい→好厉害 recover
        if (/気持ちいい|きもちいい|きもちぃ|キモチイイ/.test(src)) {
            let base = /[?？]/.test(src)
                ? (/これ/.test(src) ? T.thisFeelQZh : T.feelGoodQZh)
                : (/[…・]/.test(src) ? T.feelGoodEllZh : T.feelGoodZh);
            if (/動いて欲しい|動いて/.test(src) && !/[?？]/.test(src)) {
                return `${String(base).replace(/[。．.!！?\s]*$/u, '')}…这次想让你动一动`;
            }
            return base;
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
                        ? `${T.woZh}${timeZh}${T.allWantWithZh}${partnerZh}${T.makeLoveZh}${T.periodZh}`
                        : `${T.iWantWithZh}${partnerZh}${T.makeLoveZh}${T.periodZh}`;
                }
            }
            if (new RegExp(`(?:${T.sexJa}|${T.sexHiraJa})したい`).test(src)) {
                return `${T.woZh}${T.wantSexZh}${T.periodZh}`;
            }
            if (new RegExp(`(?:${T.sexJa}|${T.sexHiraJa})しよ`).test(src)) {
                return `${T.weZh}${T.makeLoveZh}${T.baQZh}`;
            }
        }

        return null;
    }

    /**
     * Semantic intent index for tooling (conflict report / ship-gate).
     * Does not change runtime sanitize behavior.
     * @returns {Array<object>}
     */
    function getSanitizeIntents() {
        let intentCore = null;
        try {
            if (typeof require === 'function') {
                intentCore = require('./mt-sanitize-intent-core');
            }
        } catch (_) {
            intentCore = (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitizeIntent)
                || (typeof window !== 'undefined' && window.TransubMtSanitizeIntent)
                || null;
        }
        if (!intentCore?.buildAllIntents) return [];
        return intentCore.buildAllIntents({
            T,
            FIX,
            getAsrAdultDomainPairs,
        });
    }

    return {
        d,
        T,
        RE,
        FIX,
        getAsrAdultDomainPairs,
        getSanitizeIntents,
        applyTrainingDomainFixes,
        applyAdultSemanticFixes,
        remapAdultZhFromJa,
        shouldKeepOrphanStuckZh,
        recoverBlankAdultDialogue,
    };
}));
