extends Control

@onready var fighters_root: Control = $Fighters
@onready var stages_root: Control = $Stages

@onready var p1_visuals: Control = $Player1
@onready var p2_visuals: Control = $Player2

@onready var p1_title_player: CanvasItem = $"Player One"
@onready var p2_title_player: CanvasItem = $"Player Two"
@onready var p2_title_cpu: CanvasItem = $CPU
@onready var p1_name_label: Label = $Tag1
@onready var p2_name_label: Label = $Tag2

const BASE_URL := "https://soul-resurgence-backend.onrender.com"

const FIGHTER_ID_MAP := {
	"warrick": "joseph_warrick",
	"eric": "joseph_warrick",
	"franklin": "franklin_gravestone",
	"maiden": "frozen_maiden",
	"grim": "grim",
	"chorus": "chorus",
	"roman": "lucius_silvannus",
	"sylvannus": "lucius_silvannus",
	"silv": "silv",
	"bot": "bot",
}

const ID_TO_VISUAL_RAW := {
	"joseph_warrick": "Warrick",
	"franklin_gravestone": "Franklin",
	"frozen_maiden": "Maiden",
	"grim": "Grim",
	"chorus": "Chorus",
	"lucius_silvannus": "Roman",
	"silv": "Silv",
	"bot": "Bot",
}

var selecting_player := 1
var fighter_buttons: Array[BaseButton] = []
var stage_buttons: Array[BaseButton] = []

var locked_p1_raw: String = ""
var locked_p2_raw: String = ""

var hover_blue: StyleBoxFlat
var hover_red: StyleBoxFlat

var http: HTTPRequest
var sync_timer: Timer
var pending_action: String = ""

func _ready() -> void:
	$CharSelectPreSolo.play()

	http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_request_completed)

	sync_timer = Timer.new()
	sync_timer.wait_time = 0.75
	sync_timer.one_shot = false
	sync_timer.timeout.connect(_poll_online_state)
	add_child(sync_timer)

	_hide_all_visuals(p1_visuals)
	_hide_all_visuals(p2_visuals)
	_apply_name_labels()

	if _is_online_match_enabled():
		selecting_player = _get_local_online_side()
		GameState.current_pick_side = selecting_player
	else:
		GameState.current_pick_side = 1
		selecting_player = 1

	for c in fighters_root.get_children():
		if c is BaseButton:
			fighter_buttons.append(c)
			var raw := String(c.name)
			c.pressed.connect(_on_fighter_pressed.bind(raw))
			c.mouse_entered.connect(_on_fighter_hover.bind(raw))
			c.focus_entered.connect(_on_fighter_hover.bind(raw))
			c.mouse_exited.connect(_on_fighter_unhover)
			c.focus_exited.connect(_on_fighter_unhover)

	for c in stages_root.get_children():
		if c is BaseButton:
			stage_buttons.append(c)
			c.visible = false
			c.disabled = true
			c.pressed.connect(_on_stage_pressed.bind(_stage_path_from_button_name(c.name)))

	_set_stage_buttons_enabled(false)

	hover_blue = _make_outline_style(Color(0.2, 0.6, 1.0, 1.0))
	hover_red = _make_outline_style(Color(1.0, 0.25, 0.25, 1.0))
	_apply_fighter_hover_style()
	_refresh_locked_visuals()
	_apply_name_labels()

	if _is_online_match_enabled():
		sync_timer.start() # keeps both screens updated from backend

func _process(_delta: float) -> void:
	if Input.is_action_just_pressed("escape"):
		get_tree().change_scene_to_file("res://ui/main_menu/scene/main_menu.tscn")

func _is_online_match_enabled() -> bool:
	if GameState == null:
		return false
	return GameState.is_online_match

func _get_local_online_side() -> int:
	if GameState == null:
		return 1
	if int(GameState.online_local_side) == 2:
		return 2
	return 1

func _get_online_tag(key: String, fallback: String) -> String:
	if GameState == null:
		return fallback
	var value = GameState.get(key)
	if value == null:
		return fallback
	var text := str(value).strip_edges()
	return fallback if text == "" else text

func _apply_name_labels() -> void:
	if _is_online_match_enabled():
		p2_title_cpu.visible = false
		p2_title_player.visible = true
		p1_title_player.visible = true
		p1_name_label.text = _get_online_tag("online_p1_tag", "Player One")
		p2_name_label.text = _get_online_tag("online_p2_tag", "Player Two")
		return

	var is_pvc := false
	if GameState != null:
		is_pvc = GameState.match_mode == GameState.MatchMode.PVC

	p2_title_cpu.visible = is_pvc
	p2_title_player.visible = not is_pvc
	p1_title_player.visible = true
	p1_name_label.text = "Player One"
	p2_name_label.text = "Player Two"

func _resolve_fighter_id(raw_name: String) -> String:
	var key := raw_name.strip_edges().to_lower()
	return FIGHTER_ID_MAP.get(key, key)

func _visual_raw_from_fighter_id(fighter_id: String) -> String:
	var key := fighter_id.strip_edges().to_lower()
	return ID_TO_VISUAL_RAW.get(key, "")

func _resolve_visual_name(raw_name: String) -> String:
	var k := raw_name.strip_edges().to_lower()
	if k == "eric":
		return "Warrick"
	return raw_name

func _on_fighter_hover(raw_name: String) -> void:
	if raw_name.strip_edges().to_lower() == "random":
		return

	if _is_online_match_enabled():
		_refresh_locked_visuals()
		if _get_local_online_side() == 1:
			_show_visual(p1_visuals, raw_name, 1) # host previews left side only
		else:
			_show_visual(p2_visuals, raw_name, 2) # guest previews right side only
		return

	if selecting_player == 1:
		_hide_all_visuals(p1_visuals)
		_show_locked()
		_show_visual(p1_visuals, raw_name, 1)
	else:
		_hide_all_visuals(p2_visuals)
		_show_locked()
		_show_visual(p2_visuals, raw_name, 2)

func _on_fighter_unhover() -> void:
	if _is_online_match_enabled():
		_refresh_locked_visuals()
		return

	_hide_all_visuals(p1_visuals)
	_hide_all_visuals(p2_visuals)
	_show_locked()

func _on_fighter_pressed(raw_name: String) -> void:
	var fighter_id := _resolve_fighter_id(raw_name)

	if raw_name.strip_edges().to_lower() == "random":
		var ex := ""
		if _is_online_match_enabled():
			if _get_local_online_side() == 2:
				ex = locked_p1_raw
			else:
				ex = locked_p2_raw
		elif selecting_player == 2:
			ex = locked_p1_raw

		raw_name = _pick_random_fighter_raw_name(ex)
		fighter_id = _resolve_fighter_id(raw_name)

	if _is_online_match_enabled():
		var local_side := _get_local_online_side()

		if local_side == 1:
			GameState.p1_fighter_id = fighter_id
			locked_p1_raw = raw_name
		else:
			GameState.p2_fighter_id = fighter_id
			locked_p2_raw = raw_name

		_refresh_locked_visuals()
		_send_character_pick(raw_name, fighter_id, local_side) # send to backend so other client mirrors it
		_disable_fighter_buttons_after_online_pick()
		return

	if selecting_player == 1:
		GameState.p1_fighter_id = fighter_id
		locked_p1_raw = raw_name

		_hide_all_visuals(p1_visuals)
		_show_visual(p1_visuals, locked_p1_raw, 1)

		selecting_player = 2
		GameState.current_pick_side = 2
		_apply_fighter_hover_style()

		_hide_all_visuals(p2_visuals)
		_show_locked()
		return

	GameState.p2_fighter_id = fighter_id
	locked_p2_raw = raw_name

	_hide_all_visuals(p2_visuals)
	_show_visual(p2_visuals, locked_p2_raw, 2)

	_on_both_fighters_chosen()

func _send_character_pick(raw_name: String, fighter_id: String, side: int) -> void:
	if GameState.online_room_code == "":
		return

	if http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return

	pending_action = "pick_character"

	var body := JSON.stringify({
		"room_code": GameState.online_room_code,
		"side": side,
		"fighter_raw": raw_name,
		"fighter_id": fighter_id
	})

	var headers := PackedStringArray([
		"Content-Type: application/json"
	])

	http.request(
		BASE_URL + "/select_character",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _poll_online_state() -> void:
	if not _is_online_match_enabled():
		return

	if GameState.online_room_code == "":
		return

	if http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return

	pending_action = "character_state"

	var body := JSON.stringify({
		"room_code": GameState.online_room_code
	})

	var headers := PackedStringArray([
		"Content-Type: application/json"
	])

	http.request(
		BASE_URL + "/character_select_state",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _apply_remote_character_state(data: Dictionary) -> void:
	GameState.online_p1_tag = str(data.get("host_tag", GameState.online_p1_tag))
	GameState.online_p2_tag = str(data.get("guest_tag", GameState.online_p2_tag))
	_apply_name_labels()

	if data.has("p1_id"):
		var id1 := str(data["p1_id"])
		if id1 != "":
			GameState.p1_fighter_id = id1

	if data.has("p2_id"):
		var id2 := str(data["p2_id"])
		if id2 != "":
			GameState.p2_fighter_id = id2

	if data.has("p1_raw"):
		var r1 := str(data["p1_raw"])
		if r1 != "":
			locked_p1_raw = r1

	if data.has("p2_raw"):
		var r2 := str(data["p2_raw"])
		if r2 != "":
			locked_p2_raw = r2

	if locked_p1_raw == "" and GameState.p1_fighter_id != "":
		locked_p1_raw = _visual_raw_from_fighter_id(GameState.p1_fighter_id) # fallback if raw did not arrive cleanly

	if locked_p2_raw == "" and GameState.p2_fighter_id != "":
		locked_p2_raw = _visual_raw_from_fighter_id(GameState.p2_fighter_id) # fallback if raw did not arrive cleanly

	if data.has("stage_path"):
		var stage_v := str(data["stage_path"])
		if stage_v != "":
			GameState.stage_path = stage_v

	_refresh_locked_visuals() # redraw both sides every sync so it looks like local select on both screens

	var both_locked: bool = false
	if data.has("both_locked"):
		both_locked = data["both_locked"] == true

	if both_locked:
		_on_both_fighters_chosen_online(data)

func _on_both_fighters_chosen_online(data: Dictionary) -> void:
	for b in fighter_buttons:
		b.visible = false
		b.disabled = true

	_refresh_locked_visuals()
	_set_stage_buttons_enabled(true)

	var stage_locked := str(data.get("stage_path", ""))
	if stage_locked != "":
		GameState.stage_path = stage_locked
		sync_timer.stop()
		get_tree().change_scene_to_file("res://ui/versus/scene/versus.tscn")
		return

	if _get_local_online_side() == 1:
		for b in stage_buttons:
			b.disabled = false # only host can choose stage
		if stage_buttons.size() > 0:
			stage_buttons[0].grab_focus()
	else:
		for b in stage_buttons:
			b.disabled = true # guest sees stage options but cannot pick

func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()

	if result != HTTPRequest.RESULT_SUCCESS:
		return

	if text == "":
		return

	var json := JSON.new()
	var parse_result := json.parse(text)
	if parse_result != OK:
		return

	var data: Dictionary = json.data

	if pending_action == "pick_character":
		if response_code == 200 and data.get("success", false):
			_apply_remote_character_state(data)

	elif pending_action == "character_state":
		if response_code == 200 and data.get("success", false):
			_apply_remote_character_state(data)

	elif pending_action == "select_stage":
		if response_code == 200 and data.get("success", false):
			_apply_remote_character_state(data)

func _disable_fighter_buttons_after_online_pick() -> void:
	for b in fighter_buttons:
		b.disabled = true

func _refresh_locked_visuals() -> void:
	_hide_all_visuals(p1_visuals)
	_hide_all_visuals(p2_visuals)

	if locked_p1_raw != "":
		_show_visual(p1_visuals, locked_p1_raw, 1)

	if locked_p2_raw != "":
		_show_visual(p2_visuals, locked_p2_raw, 2)

func _on_both_fighters_chosen() -> void:
	for b in fighter_buttons:
		b.visible = false
		b.disabled = true

	_refresh_locked_visuals()

	_set_stage_buttons_enabled(true)
	if stage_buttons.size() > 0:
		stage_buttons[0].grab_focus()

func _show_locked() -> void:
	if locked_p1_raw != "":
		_show_visual(p1_visuals, locked_p1_raw, 1)
	if locked_p2_raw != "":
		_show_visual(p2_visuals, locked_p2_raw, 2)

func _show_visual(container: Control, fighter_raw: String, side: int) -> void:
	fighter_raw = _resolve_visual_name(fighter_raw)

	var r := fighter_raw.strip_edges()
	var rlow := r.to_lower()

	var png_candidates := [
		"%spngP%d" % [r, side],
		"%spngP%d" % [rlow, side],
	]
	var lbl_candidates := [
		"%sp%d" % [r, side],
		"%sp%d" % [rlow, side],
	]

	for n in png_candidates:
		var png := container.get_node_or_null(n)
		if png and png is CanvasItem:
			(png as CanvasItem).visible = true

	for n in lbl_candidates:
		var lbl := container.get_node_or_null(n)
		if lbl and lbl is CanvasItem:
			(lbl as CanvasItem).visible = true

func _hide_all_visuals(container: Control) -> void:
	for child in container.get_children():
		if child is CanvasItem:
			(child as CanvasItem).visible = false

func _pick_random_fighter_raw_name(exclude: String = "") -> String:
	var ids: Array[String] = []
	for b in fighter_buttons:
		var n := String(b.name)
		if n.strip_edges().to_lower() == "random":
			continue
		ids.append(n)

	if exclude != "":
		ids.erase(exclude)

	if ids.is_empty():
		return exclude
	return ids.pick_random()

func _set_stage_buttons_enabled(enabled: bool) -> void:
	for b in stage_buttons:
		b.visible = enabled
		b.disabled = not enabled

func _stage_path_from_button_name(btn_name: String) -> String:
	match btn_name:
		"Stage 1":
			return "res://Stage 1/Scene/Stage_1.tscn"
		"Stage 2":
			return "res://Stage 2/scene/stage_2.tscn"
		"Stage 3":
			return "res://Stage 3/scene/stage_3.tscn"
		"Training Room":
			return "res://Training_mode/scene/training_mode.tscn"
		_:
			return ""

func _on_stage_pressed(stage_path: String) -> void:
	if stage_path == "":
		return

	if _is_online_match_enabled():
		if _get_local_online_side() != 1:
			return

		GameState.stage_path = stage_path

		if GameState.online_room_code == "":
			return

		if http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
			return

		pending_action = "select_stage"

		var body := JSON.stringify({
			"room_code": GameState.online_room_code,
			"stage_path": stage_path
		})

		var headers := PackedStringArray([
			"Content-Type: application/json"
		])

		http.request(
			BASE_URL + "/select_stage",
			headers,
			HTTPClient.METHOD_POST,
			body
		)
		return

	GameState.stage_path = stage_path
	get_tree().change_scene_to_file("res://ui/versus/scene/versus.tscn")

func _apply_fighter_hover_style() -> void:
	var side := selecting_player
	if _is_online_match_enabled():
		side = _get_local_online_side()

	var style := hover_blue if side == 1 else hover_red
	for b in fighter_buttons:
		b.add_theme_stylebox_override("hover", style)
		b.add_theme_stylebox_override("focus", style)

func _make_outline_style(outline_color: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0)
	sb.border_width_left = 3
	sb.border_width_top = 3
	sb.border_width_right = 3
	sb.border_width_bottom = 3
	sb.border_color = outline_color
	return sb
