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

### `!claim {squadID_1} {squadID_2} [squadID_3 ...]`

Compares X number of squads in the player's own team and displays their information (oldest squad first).

**Examples:**

```text
!claim 1 3
!claim 1 3 5
!claim 2 4 6 1
```

## Admin Commands

> Only valid in the admin chat (`ChatAdmin`).

---

### `!claim {team_short_name}|other {squadID_1} {squadID_2} [squadID_3 ...]`

Compare X number of squads of a specific team or simply for the opposing team with "other".

**Examples:**

```text
!claim 1 3
!claim other 1 3
!claim other 1 3 5
!claim rgf 1 3 7
!claim usa 2 4 6 8
```

## Configuration

### Options
- `plugin` (string): Must be set to `"Claim"`.
- `enabled` (boolean, default: `true`): Enable or disable the plugin.
- `commandPrefix` (string, default: `"claim"`): Chat command prefix.
- `onlySquadLeader` (boolean, default: `false`): If `true`, only squad leaders can use the command (admins are always allowed, but still respect the admin cooldown).
- `adminCooldownSeconds` (number, default: e.g. `3`): cooldown in seconds between usages in admin chat.
- `playerCooldownSeconds` (number, default: e.g. `5`): cooldown in seconds for non-admin players between usages.

### Example configuration
```json
{
  "plugin": "Claim",
  "enabled": true,
  "commandPrefix": "claim",
  "onlySquadLeader": false,
  "adminCooldownSeconds": 3,
  "playerCooldownSeconds": 5
}
```
