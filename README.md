# squadjs-claim-plugin

SquadJS plugin to track, display, and compare created squads on a Squad game server.

This can be useful for in-game administrators to check vehicle claims when vehicle claim rules are enabled on the server.

## User Commands

The squad list is sorted by squad creation time, with the oldest squads displayed first.

### `!claim help`
Shows a short overview of all available `!claim` options.
```text
!claim help
```

---

### `!claim`

Shows all currently tracked squads in the player's own team.

```text
!claim
```

---

### `!claim {squadID_1} {squadID_2}`

Compares two squads in the player's own team and displays their information.

**Examples:**

```text
!claim 1 3
```
```text
!claim 2 5
```

## Admin Commands

> Only valid in the admin chat (`ChatAdmin`).

---

### `!claim {team_short_name}|other`

Shows all currently tracked squads of a specific team.

**Examples:**

```text
!claim other
```
```text
!claim usa
```
```text
!claim rgf
```
```text
!claim wpmc
```

---

### `!claim {team_short_name}|other {squadID_1} {squadID_2}`

Compare two squads of a specific team using a team short name.

**Examples:**

```text
!claim other 6 8
```
```text
!claim rgf 1 3
```
```text
!claim uaf 2 4
```

## Configuration

### Options
- `plugin` (string): Must be set to `"Claim"`.
- `enabled` (boolean, default: `true`): Enable or disable the plugin.
- `commandPrefix` (string, default: `"claim"`): Chat command prefix.
- `onlySquadLeader` (boolean, default: `false`): If `true`, only squad leaders can use `!claim` (admins are always allowed).
- `warnDelaySeconds` (number, default: `6`): Delay in seconds between warns for big squad list.

### Example configuration
```json
{
  "plugin": "Claim",
  "enabled": true,
  "commandPrefix": "claim",
  "onlySquadLeader": false,
  "warnDelaySeconds": 6
}
```