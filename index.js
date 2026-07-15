const express = require("express");
const crypto = require("crypto");

const app = express();

app.use(express.json());

let rooms = {};

const onlinePlayers = new Map();

const PLAYER_TIMEOUT_MS = 30 * 1000;

const DEVELOPER_GAMERTAGS = new Set([
    "un1bear",
    "un1bae",
    "kmaster09",
    "bigounce",
    "revkkomix",
    "saphy",
    "saphysapphire",
    "silvrware",
    "thenikgaming"
]);

const DEVELOPER_PASSWORD =
    process.env.DEVELOPER_PASSWORD || "";

const DEVELOPER_TOKEN_SECRET =
    process.env.DEVELOPER_TOKEN_SECRET || "";

const DEVELOPER_TOKEN_LIFETIME_MS =
    1000 * 60 * 60 * 24 * 7; // seven days

function normalizeDeveloperGamertag(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replaceAll("♥", "");
}

function isReservedDeveloperGamertag(value) {
    const normalized = normalizeDeveloperGamertag(value);
    return DEVELOPER_GAMERTAGS.has(normalized);
}

function safeSecretCompare(received, expected) {
    const receivedBuffer = Buffer.from(String(received || ""));
    const expectedBuffer = Buffer.from(String(expected || ""));

    if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
    );
}

function markPlayerOnline(playerId, gamertag = "") {
    const cleanedId = String(playerId || "").trim();

    if (cleanedId === "") {
        return;
    }

    onlinePlayers.set(cleanedId, {
        player_id: cleanedId,
        gamertag: String(gamertag || "").trim(),
        last_seen: Date.now()
    });
}

function markPlayerOffline(playerId) {
    const cleanedId = String(playerId || "").trim();

    if (cleanedId === "") {
        return;
    }

    onlinePlayers.delete(cleanedId);
}

function cleanInactivePlayers() {
    const now = Date.now();

    for (const [playerId, player] of onlinePlayers.entries()) {
        if (now - player.last_seen > PLAYER_TIMEOUT_MS) {
            onlinePlayers.delete(playerId);
        }
    }
}

function getOnlinePlayerCount() {
    cleanInactivePlayers();
    return onlinePlayers.size;
}

function signDeveloperToken(gamertag) {
    if (DEVELOPER_TOKEN_SECRET === "") {
        return "";
    }

    const payload = {
        developer_name: normalizeDeveloperGamertag(gamertag),
        expires_at: Date.now() + DEVELOPER_TOKEN_LIFETIME_MS
    };

    const encodedPayload = Buffer.from(
        JSON.stringify(payload)
    ).toString("base64url");

    const signature = crypto
        .createHmac("sha256", DEVELOPER_TOKEN_SECRET)
        .update(encodedPayload)
        .digest("base64url");

    return encodedPayload + "." + signature;
}

function verifyDeveloperToken(token, gamertag) {
    if (
        typeof token !== "string" ||
        token === "" ||
        DEVELOPER_TOKEN_SECRET === ""
    ) {
        return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return false;
    }

    const encodedPayload = parts[0];
    const receivedSignature = parts[1];

    const expectedSignature = crypto
        .createHmac("sha256", DEVELOPER_TOKEN_SECRET)
        .update(encodedPayload)
        .digest("base64url");

    if (
        !safeSecretCompare(
            receivedSignature,
            expectedSignature
        )
    ) {
        return false;
    }

    try {
        const payload = JSON.parse(
            Buffer.from(
                encodedPayload,
                "base64url"
            ).toString("utf8")
        );

        if (
            !payload ||
            Number(payload.expires_at) <= Date.now()
        ) {
            return false;
        }

        const requestedName =
            normalizeDeveloperGamertag(gamertag);

        return (
            payload.developer_name === requestedName &&
            DEVELOPER_GAMERTAGS.has(requestedName)
        );
    } catch (_error) {
        return false;
    }
}

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function defaultPlayerState(side) {
    return {
        player_id: side,
        x: side === 1 ? -2.0 : 2.0,
        y: 0.0,
        z: 0.0,
        rot_y: side === 1 ? 0.0 : 3.14159265359,
        vel_x: 0.0,
        anim: "idle",
        hp: 1000,
        max_hp: 1000,
        state_seq: 0,
        updated_at: Date.now()
    };
}

function ensureCharSelect(room) {
    if (!room.char_select) {
        room.char_select = {
            p1_raw: "",
            p1_id: "",
            p2_raw: "",
            p2_id: "",
            stage_path: ""
        };
    }
}

function ensureFightState(room) {
    if (!room.fight_state) {
        room.fight_state = {
            p1_state: defaultPlayerState(1),
            p2_state: defaultPlayerState(2)
        };
    }

    if (!room.fight_state.p1_state) {
        room.fight_state.p1_state = defaultPlayerState(1);
    }

    if (!room.fight_state.p2_state) {
        room.fight_state.p2_state = defaultPlayerState(2);
    }
}

function safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback) {
    if (value === undefined || value === null) {
        return fallback;
    }
    return String(value);
}

function sanitizeState(raw, forcedPlayerId, previousState) {
    const prev = previousState || defaultPlayerState(forcedPlayerId);
    const src = raw || {};

    const maxHp = Math.max(
        1,
        safeNumber(src.max_hp, prev.max_hp)
    );

    let hp = safeNumber(src.hp, prev.hp);
    hp = Math.max(0, Math.min(hp, maxHp));

    const nextSeq = Math.max(
        safeNumber(src.state_seq, prev.state_seq + 1),
        prev.state_seq
    );

    return {
        player_id: forcedPlayerId,
        x: safeNumber(src.x, prev.x),
        y: safeNumber(src.y, prev.y),
        z: safeNumber(src.z, prev.z),
        rot_y: safeNumber(src.rot_y, prev.rot_y),
        vel_x: safeNumber(src.vel_x, prev.vel_x),
        anim: safeString(src.anim, prev.anim),
        hp: hp,
        max_hp: maxHp,
        state_seq: nextSeq,
        updated_at: Date.now()
    };
}

function shouldAcceptState(incomingRaw, currentState) {
    const currentSeq = safeNumber(currentState?.state_seq, 0);
    const incomingSeq = safeNumber(incomingRaw?.state_seq, currentSeq + 1);

    return incomingSeq >= currentSeq;
}

function makeRole(room, requesterId) {
    const who = String(requesterId || "");
    if (who !== "" && who === room.host) {
        return { is_host: true, assigned_side: 1 };
    }
    if (who !== "" && who === room.guest) {
        return { is_host: false, assigned_side: 2 };
    }
    return { is_host: false, assigned_side: 0 };
}

function makeRoomState(room, requesterId) {
    ensureCharSelect(room);
    ensureFightState(room);

    const both_locked =
        room.char_select.p1_id !== "" &&
        room.char_select.p2_id !== "";

    const role = makeRole(room, requesterId);

    return {
        success: true,
        room_code: room.code,
        status: room.status,
        host_tag: room.host_tag || "Player One",
        guest_tag: room.guest_tag || "Player Two",
        host_is_developer:
            room.host_is_developer === true,
        guest_is_developer:
            room.guest_is_developer === true,
        p1_raw: room.char_select.p1_raw,
        p1_id: room.char_select.p1_id,
        p2_raw: room.char_select.p2_raw,
        p2_id: room.char_select.p2_id,
        stage_path: room.char_select.stage_path,
        both_locked: both_locked,
        is_host: role.is_host,
        assigned_side: role.assigned_side,
        p1_state: room.fight_state.p1_state,
        p2_state: room.fight_state.p2_state
    };
}

app.get("/", (_req, res) => {
    res.send("Backend is live");
});
app.post("/player_heartbeat", (req, res) => {
    const playerId = String(
        req.body.player_id || ""
    ).trim();

    const gamertag = String(
        req.body.gamertag || ""
    ).trim();

    if (playerId === "") {
        return res.status(400).json({
            success: false,
            message: "Player ID is required."
        });
    }

    markPlayerOnline(playerId, gamertag);

    return res.json({
        success: true,
        online_count: getOnlinePlayerCount()
    });
});
app.get("/online_count", (_req, res) => {
    return res.json({
        success: true,
        online_count: getOnlinePlayerCount()
    });
});
app.post("/verify_developer", (req, res) => {
    const gamertag = String(
        req.body.gamertag || ""
    ).trim();

    const password = String(
        req.body.password || ""
    );

    if (
        DEVELOPER_PASSWORD === "" ||
        DEVELOPER_TOKEN_SECRET === ""
    ) {
        console.error(
            "Developer environment variables are missing."
        );

        return res.status(503).json({
            success: false,
            is_developer: false,
            message: "Developer verification unavailable."
        });
    }

    if (!isReservedDeveloperGamertag(gamertag)) {
        return res.status(403).json({
            success: false,
            is_developer: false,
            message: "This is not a developer gamertag."
        });
    }

    if (
        !safeSecretCompare(
            password,
            DEVELOPER_PASSWORD
        )
    ) {
        return res.status(403).json({
            success: false,
            is_developer: false,
            message: "Incorrect developer password."
        });
    }

    const developerToken =
        signDeveloperToken(gamertag);

    if (developerToken === "") {
        return res.status(500).json({
            success: false,
            is_developer: false,
            message: "Could not create developer token."
        });
    }

    return res.json({
        success: true,
        is_developer: true,
        gamertag: gamertag,
        developer_token: developerToken
    });
});
app.post("/create_room", (req, res) => {
    const code = generateCode();

    const hostId = String(
        req.body.player_id ||
        ("host_" + Date.now())
    );

    const hostTag = String(
        req.body.gamertag || "Player One"
    ).trim();
    
    markPlayerOnline(hostId, hostTag);
    
    const developerToken = String(
        req.body.developer_token || ""
    );

    const reservedDeveloperName =
        isReservedDeveloperGamertag(hostTag);

    const verifiedDeveloper =
        verifyDeveloperToken(
            developerToken,
            hostTag
        );

    /*
     * Reserved developer names cannot enter online rooms
     * without a valid server-issued token.
     */
    if (
        reservedDeveloperName &&
        !verifiedDeveloper
    ) {
        return res.status(403).json({
            success: false,
            message:
                "Developer verification is required for this gamertag."
        });
    }

    rooms[code] = {
        code: code,
        host: hostId,
        host_tag: hostTag,
        host_is_developer: verifiedDeveloper,
        guest: null,
        guest_tag: "Player Two",
        guest_is_developer: false,
        status: "waiting",
        char_select: {
            p1_raw: "",
            p1_id: "",
            p2_raw: "",
            p2_id: "",
            stage_path: ""
        },
        fight_state: {
            p1_state: defaultPlayerState(1),
            p2_state: defaultPlayerState(2)
        }
    };

    res.json({
        success: true,
        room_code: code,
        host_tag: rooms[code].host_tag,
        guest_tag: rooms[code].guest_tag,
        host_is_developer:
            rooms[code].host_is_developer,
        guest_is_developer: false,
        is_host: true,
        assigned_side: 1,
        message: "Room created"
    });
});

app.post("/join_room", (req, res) => {
    const roomCode = String(
        req.body.room_code || ""
    ).toUpperCase();

    const playerId = String(
        req.body.player_id ||
        ("guest_" + Date.now())
    );

    const gamertag = String(
        req.body.gamertag || "Player Two"
    ).trim();
    
    markPlayerOnline(playerId, gamertag);
    
    const developerToken = String(
        req.body.developer_token || ""
    );

    if (!rooms[roomCode]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[roomCode];

    if (
        room.guest !== null &&
        room.guest !== playerId
    ) {
        return res.status(409).json({
            success: false,
            message: "Room full"
        });
    }

    const reservedDeveloperName =
        isReservedDeveloperGamertag(gamertag);

    const verifiedDeveloper =
        verifyDeveloperToken(
            developerToken,
            gamertag
        );

    if (
        reservedDeveloperName &&
        !verifiedDeveloper
    ) {
        return res.status(403).json({
            success: false,
            message:
                "Developer verification is required for this gamertag."
        });
    }

    room.guest = playerId;
    room.guest_tag = gamertag;
    room.guest_is_developer =
        verifiedDeveloper;
    room.status = "full";

    res.json({
        success: true,
        room_code: roomCode,
        host_tag: room.host_tag,
        guest_tag: room.guest_tag,
        host_is_developer:
            room.host_is_developer === true,
        guest_is_developer:
            room.guest_is_developer === true,
        is_host: false,
        assigned_side: 2,
        message: "Joined room"
    });
});

app.post("/leave_room", (req, res) => {
    const roomCode = String(
        req.body.room_code || ""
    ).trim().toUpperCase();

    const playerId = String(
        req.body.player_id || ""
    ).trim();

    if (roomCode === "" || playerId === "") {
        return res.status(400).json({
            success: false,
            message: "Room code and player ID are required."
        });
    }

    const room = rooms[roomCode];

    /*
     * The client may call this after the room was already
     * deleted. Treat that as successfully cleaned up.
     */
    if (!room) {
        return res.json({
            success: true,
            room_deleted: true,
            message: "Room was already closed."
        });
    }

    /*
     * If the host leaves, close the entire room.
     * The guest must also be removed from that room.
     */
    if (playerId === room.host) {
        delete rooms[roomCode];

        return res.json({
            success: true,
            room_deleted: true,
            message: "Host left. Room closed."
        });
    }

    /*
     * If the guest leaves, keep the room open and return
     * it to the waiting state.
     */
    if (playerId === room.guest) {
        room.guest = null;
        room.guest_tag = "Player Two";
        room.guest_is_developer = false;
        room.status = "waiting";

        ensureCharSelect(room);
        ensureFightState(room);

        room.char_select.p2_raw = "";
        room.char_select.p2_id = "";
        room.char_select.stage_path = "";

        room.fight_state.p2_state =
            defaultPlayerState(2);

        return res.json({
            success: true,
            room_deleted: false,
            status: room.status,
            message: "Guest left the room."
        });
    }

    return res.status(403).json({
        success: false,
        message: "Player is not part of this room."
    });
});

app.post("/room_status", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    markPlayerOnline(requester_id);
    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    res.json(makeRoomState(room, requester_id));
});

app.post("/character_select_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    markPlayerOnline(requester_id);
    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    res.json(makeRoomState(room, requester_id));
});

app.post("/select_character", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    const fighter_raw = String(req.body.fighter_raw || "");
    const fighter_id = String(req.body.fighter_id || "");
    markPlayerOnline(requester_id);
    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureCharSelect(room);

    if (requester_id === room.host) {
        room.char_select.p1_raw = fighter_raw;
        room.char_select.p1_id = fighter_id;
    } else if (requester_id === room.guest) {
        room.char_select.p2_raw = fighter_raw;
        room.char_select.p2_id = fighter_id;
    } else {
        return res.status(403).json({
            success: false,
            message: "Player is not part of this room"
        });
    }

    res.json(makeRoomState(room, requester_id));
});

app.post("/select_stage", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    const stage_path = String(req.body.stage_path || "");
    markPlayerOnline(requester_id);
    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureCharSelect(room);
    room.char_select.stage_path = stage_path;

    res.json(makeRoomState(room, requester_id));
});

app.post("/update_fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");
    const state = req.body.state || {};
    markPlayerOnline(requester_id);
    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureFightState(room);

    if (requester_id === room.host) {
        const current = room.fight_state.p1_state;
        if (shouldAcceptState(state, current)) {
            room.fight_state.p1_state = sanitizeState(state, 1, current);
        }
    } else if (requester_id === room.guest) {
        const current = room.fight_state.p2_state;
        if (shouldAcceptState(state, current)) {
            room.fight_state.p2_state = sanitizeState(state, 2, current);
        }
    } else {
        return res.status(403).json({
            success: false,
            message: "Player is not part of this room"
        });
    }
    markPlayerOnline(requester_id);
    res.json(makeRoomState(room, requester_id));
});

app.post("/fight_state", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const requester_id = String(req.body.player_id || "");

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    const room = rooms[room_code];
    ensureFightState(room);
    res.json(makeRoomState(room, requester_id));
});
setInterval(() => {
    cleanInactivePlayers();
}, 10 * 1000);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
