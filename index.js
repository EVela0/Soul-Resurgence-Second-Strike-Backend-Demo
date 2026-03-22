app.get("/", (_req, res) => {
    res.send("Backend is live");
});

app.post("/create_room", (req, res) => {
    const code = generateCode();

    rooms[code] = {
        host: req.body.player_id || "host_player",
        guest: null,
        status: "waiting"
    };

    res.json({
        success: true,
        room_code: code,
        message: "Room created"
    });
});

app.post("/join_room", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();
    const player_id = req.body.player_id || "guest_player";

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    if (rooms[room_code].guest !== null) {
        return res.status(409).json({
            success: false,
            message: "Room full"
        })
    }

    rooms[room_code].guest = player_id;
    rooms[room_code].status = "full";

    res.json({
        success: true,
        room_code: room_code,
        message: "Joined room"
    });
});

app.post("/room_status", (req, res) => {
    const room_code = String(req.body.room_code || "").toUpperCase();

    if (!rooms[room_code]) {
        return res.status(404).json({
            success: false,
            message: "Room not found"
        });
    }

    res.json({
        success: true,
        room_code: room_code,
        status: rooms[room_code].status
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
