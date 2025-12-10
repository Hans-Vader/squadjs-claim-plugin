# squadjs-claim-plugin

SquadJS plugin for displaying and comparing created custom squads based on their creation time.

This can be useful for in-game administrators to check vehicle claims when vehicle claim rules are enabled on the server.

The squad list is deterministically sorted by creation timestamp (ascending), so the oldest squad appears first.

## User Commands

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

Displays all squads currently being tracked for a specific team or simply for the opposing team with "other".

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

Compare two squads of a specific team or simply for the opposing team with "other".

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
- `onlySquadLeader` (boolean, default: `false`): If `true`, only squad leaders can use the command (admins are always allowed).
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
