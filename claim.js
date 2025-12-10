import BasePlugin from './base-plugin.js';

export default class Claim extends BasePlugin {
    static get description() {
        return 'Plugin to track and display created custom squads on the server.';
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            commandPrefix: {
                required: false,
                description: 'Prefix of the claim command',
                default: 'claim',
            },
            onlySquadLeader: {
                required: false,
                description: 'Only allow squad leaders to use the command',
                default: false,
            },
            warnDelaySeconds: {
                required: false,
                description: 'Delay in seconds between warns for big squad list',
                default: 6,
            },
            adminCooldownSeconds: {
                required: false,
                description: 'Cooldown in seconds between admin uses of the command',
                default: 5,
            },
            playerCooldownSeconds: {
                required: false,
                description: 'Cooldown in seconds between player uses of the command',
                default: 15,
            },
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onSquadCreated = this.onSquadCreated.bind(this);
        this.onChatCommand = this.onChatCommand.bind(this);
        this.getFactionId = this.getFactionId.bind(this);
        this.onRoundEnded = this.onRoundEnded.bind(this);

        this.createdSquadsTeam = {
            1: [],
            2: [],
        };

        // Cooldown-Tracking wie in anderen SquadJS-Plugins (pro SteamID)
        this.lastCommandUsage = {}; // { steamID: timestampMs }
    }

    async mount() {
        this.server.on(`CHAT_COMMAND:${this.options.commandPrefix}`, this.onChatCommand);
        this.server.on('SQUAD_CREATED', this.onSquadCreated);
        this.server.on('ROUND_ENDED', this.onRoundEnded);
    }

    async unmount() {
        this.server.removeEventListener(`CHAT_COMMAND:${this.options.commandPrefix}`, this.onChatCommand);
        this.server.removeEventListener('SQUAD_CREATED', this.onSquadCreated);
        this.server.removeEventListener('ROUND_ENDED', this.onRoundEnded);
    }

    async onRoundEnded() {
        this.createdSquadsTeam = {
            1: [],
            2: [],
        };
        // Cooldowns beim Rundenende zurücksetzen
        this.lastCommandUsage = {};
    }

    async onSquadCreated(info) {
        const teamID = info.player.squad.teamID;
        const squadID = info.player.squad.squadID;

        // only track custom named squads
        if (/^Squad\s+\d+$/.test(info.squadName)) {
            delete this.createdSquadsTeam[teamID][squadID];
            return;
        }

        const squadCreatedEventData = {
            squadName: info.squadName,
            teamID: teamID,
            squadID: squadID,
            steamID: info.player.steamID,
            time: info.time,
        };

        this.createdSquadsTeam[teamID][squadID] = squadCreatedEventData;
    }

    async onChatCommand(info) {
        const isAdmin = info.chat === 'ChatAdmin';
        const now = Date.now();
        const steamID = info.steamID;

        // Cooldown based on user role
        const cooldownSeconds = isAdmin
            ? Number(this.options.adminCooldownSeconds) || 0
            : Number(this.options.playerCooldownSeconds) || 0;
        const cooldownMs = cooldownSeconds * 1000;

        if (cooldownMs > 0) {
            const lastUsed = this.lastCommandUsage[steamID] || 0;
            const diff = now - lastUsed;

            if (diff < cooldownMs) {
                const remainingSec = Math.ceil((cooldownMs - diff) / 1000);
                this.server.rcon.warn(
                    steamID,
                    `Please wait ${remainingSec}s before using !${this.options.commandPrefix} again.`
                );
                return;
            }
        }

        // save last usage time
        this.lastCommandUsage[steamID] = now;

        const message = info.message.toLowerCase();
        const commandSplit = message.trim().split(' ');

        if (this.options.onlySquadLeader && info.player.isLeader === false && !isAdmin) {
            this.server.rcon.warn(info.steamID, 'Only squad leaders can use this command.');
            return;
        }

        if (commandSplit[0] === 'help') {
            if (isAdmin) {
                this.server.rcon.warn(info.steamID, this.getHelpMessageForAdmin());
                this.server.rcon.warn(info.steamID, this.getHelpMessageExamplesForAdmin());
            } else {
                this.server.rcon.warn(info.steamID, this.getHelpMessageForPlayer());
                this.server.rcon.warn(info.steamID, this.getHelpMessageExamplesForPlayer());
            }
            return;
        }

        await this.server.updateSquadList();

        let teamID = null;
        if (isNaN(commandSplit[0]) && commandSplit[0].length >= 1 && isNaN(commandSplit[1])) {
            // check all squads in a specific team

            if (!isAdmin) {
                this.server.rcon.warn(info.steamID, 'Only admins can check squads of other teams.');
                return;
            }
            let teamNameInput = commandSplit[0];

            teamID = await this.getTeamIdFromInput(teamNameInput, info);
            if (teamID === null) {
                return;
            }

            const squads = this.createdSquadsTeam[teamID];
            const lines = this.getSquadListBeautified(squads);
            this.warnInChunks(info.steamID, lines);

        } else if (isNaN(commandSplit[0]) && commandSplit[0].length > 1 && !isNaN(commandSplit[1]) && !isNaN(commandSplit[2])) {
            // check two squad in a specific team

            if (!isAdmin) {
                this.server.rcon.warn(info.steamID, 'Only admins can check squads of other teams.');
                return;
            }

            const teamNameInput = commandSplit[0];
            const squadOneID = commandSplit[1];
            const squadTwoID = commandSplit[2];

            if (squadOneID === squadTwoID) {
                this.server.rcon.warn(info.steamID, 'Please provide two different squad IDs.');
                return;
            }

            teamID = await this.getTeamIdFromInput(teamNameInput, info);
            if (teamID === null) {
                return;
            }

            if (this.createdSquadsTeam[teamID][squadOneID] === undefined) {
                this.server.rcon.warn(
                    info.steamID,
                    `Custom Squad ID: ${squadOneID} not found in team: ${teamNameInput}`
                );
                return;
            }

            if (this.createdSquadsTeam[teamID][squadTwoID] === undefined) {
                this.server.rcon.warn(
                    info.steamID,
                    `Custom Squad ID: ${squadTwoID} not found in team: ${teamNameInput}`
                );
                return;
            }

            const lines = this.getSquadListBeautified([
                this.createdSquadsTeam[teamID][squadOneID],
                this.createdSquadsTeam[teamID][squadTwoID],
            ]);
            this.warnInChunks(info.steamID, lines);

        } else if (!isNaN(commandSplit[0]) && !isNaN(commandSplit[1])) {
            // check two squad in own team

            let squadOneID = commandSplit[0];
            let squadTwoID = commandSplit[1];
            teamID = info.player.teamID;

            if (squadOneID === squadTwoID) {
                this.server.rcon.warn(info.steamID, 'Please provide two different squad IDs.');
                return;
            }

            if (this.createdSquadsTeam[teamID][squadOneID] === undefined) {
                this.server.rcon.warn(
                    info.steamID,
                    `Custom Squad ID: ${squadOneID} not found in your team`
                );
                return;
            }

            if (this.createdSquadsTeam[teamID][squadTwoID] === undefined) {
                this.server.rcon.warn(
                    info.steamID,
                    `Custom Squad ID: ${squadTwoID} not found in your team`
                );
                return;
            }

            const lines = this.getSquadListBeautified([
                this.createdSquadsTeam[teamID][squadOneID],
                this.createdSquadsTeam[teamID][squadTwoID],
            ]);
            this.warnInChunks(info.steamID, lines);
        } else {
            // check all squads in own team

            teamID = info.player.teamID;
            const squads = this.createdSquadsTeam[teamID];

            const lines = this.getSquadListBeautified(squads);
            this.warnInChunks(info.steamID, lines);
        }
    }

    getSquadListBeautified(squads) {
        if (!squads || Object.keys(squads).length === 0) {
            return ['No custom squads have been created yet.'];
        }

        const sortedSquads = Object
            .values(squads)
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        let counter = 1;
        const lines = [];

        sortedSquads.forEach((item) => {
            if (!this.doesSquadExist(item.teamID, item.squadID)) {
                delete squads[item.squadID];
                return;
            }

            const shortName = item.squadName.substring(0, 10);
            lines.push(
                `${counter}.Squad ${item.squadID}[${shortName}], created ${this.formatTime(item.time)}`
            );
            counter += 1;
        });

        return lines;
    }

    async warnInChunks(steamID, lines, chunkSize = 5) {
        if (!Array.isArray(lines) || lines.length === 0) {
            return;
        }

        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const delayMs = (Number(this.options.warnDelaySeconds) || 6) * 1000;

        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize);
            this.server.rcon.warn(steamID, chunk.join('\n'));

            if (delayMs > 0 && i + chunkSize < lines.length) {
                await sleep(delayMs);
            }
        }
    }

    formatTime(time) {
        const date = new Date(time);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    }

    doesSquadExist(teamID, squadID) {
        return this.server.squads.some(
            (squad) => squad.squadID == squadID && squad.teamID == teamID
        );
    }

    getHelpMessageForPlayer() {
        return [
            '!claim -> all squads in own team',
            '!claim id1 id2 -> compare two squads',
        ].join('\n');
    }

    getHelpMessageExamplesForPlayer() {
        return [
            'Examples:',
            '!claim',
            '!claim 1 3',
        ].join('\n');
    }

    getHelpMessageForAdmin() {
        return [
            '!claim -> all squads in own team',
            '!claim id1 id2 -> compare two squads',
            '!claim team -> show all squads of a team',
            '!claim other -> show all squads of the opposing team',
            '!claim team id1 id2 -> compare two squads of a team',
        ].join('\n');
    }

    getHelpMessageExamplesForAdmin() {
        return [
            'Examples:',
            '!claim',
            '!claim 1 3',
            '!claim usa',
            '!claim other',
            '!claim rgf 1 3',
        ].join('\n');
    }

    async getFactionId(teamPrefix) {
        await this.server.updatePlayerList();

        const lowerTeamPrefix = teamPrefix.toLowerCase();
        const firstPlayer = this.server.players.find((p) =>
            p.role.toLowerCase().startsWith(lowerTeamPrefix)
        );

        if (firstPlayer) {
            return firstPlayer.teamID;
        }

        return null;
    }

    async getTeamIdFromInput(teamInput, info) {
        if (teamInput === 'other') {
            return info.player.teamID === 1 ? 2 : 1;
        }

        const teamNamePrefix = teamInput.slice(0, 4);
        const teamID = await this.getFactionId(teamNamePrefix);

        if (teamID === null) {
            this.server.rcon.warn(
                info.steamID,
                `Faction not found or no players in team: ${teamNamePrefix}`
            );
            return null;
        }

        return teamID;
    }
}
