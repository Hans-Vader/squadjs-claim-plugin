import BasePlugin from './base-plugin.js';

export default class Claim extends BasePlugin {
    static get description() {
        return 'Plugin to track and compare created custom squads based on the creation time.';
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
            adminCooldownSeconds: {
                required: false,
                description: 'Cooldown in seconds between admin uses of the command',
                default: 3,
            },
            playerCooldownSeconds: {
                required: false,
                description: 'Cooldown in seconds between player uses of the command',
                default: 5,
            },
            debugPlugin: {
                required: false,
                description: 'Enable console logging and diables the tracked squad cleanup',
                default: false,
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
            1: {},
            2: {},
        };

        this.lastCommandUsage = {};
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
            1: {},
            2: {},
        };
        this.lastCommandUsage = {};
    }

    async onSquadCreated(info) {
        const teamID = info.player.squad.teamID;
        let squadID = info.player.squad.squadID;

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

        // count the squad ID up if debugging is enabled to avoid overwriting
        if (this.options.debugPlugin) {
            squadID += this.createdSquadsTeam[teamID] ? Object.keys(this.createdSquadsTeam[teamID]).length : 0;
            console.log(`[DEBUG LOGGING] Squad created: Team ${teamID}, Squad ${squadID} [${info.squadName}] by ${info.player.name} \n`);
            console.log(info);
        }

        this.createdSquadsTeam[teamID][squadID] = squadCreatedEventData;
    }

    async onChatCommand(info) {
        if (this.options.debugPlugin) {
            console.log(`[DEBUG LOGGING] Command used by ${info.player.name} \n`);
            console.log(info);
        }

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

        // process command //

        const message = info.message.toLowerCase();
        // split by spaces and remove empty entries
        const commandSplit = message.trim().split(/\s+/).filter(Boolean);

        if (this.options.onlySquadLeader && info.player.isLeader === false && !isAdmin) {
            this.server.rcon.warn(info.steamID, 'Only squad leaders can use this command.');
            return;
        }

        if (commandSplit.length > 0 && commandSplit[0] === 'help') {
            function showHelpMessages(isAdmin) {
                if (isAdmin) {
                    this.server.rcon.warn(info.steamID, this.getHelpMessageForAdmin());
                    this.server.rcon.warn(info.steamID, this.getHelpMessageExamplesForAdmin());
                } else {
                    this.server.rcon.warn(info.steamID, this.getHelpMessageForPlayer());
                    this.server.rcon.warn(info.steamID, this.getHelpMessageExamplesForPlayer());
                }
            }
            // show help messages twice with delay to improve visibility
            for (let i = 0; i < 2; i++) {
                showHelpMessages.call(this, isAdmin);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
            return;
        }

        // update squad list to ensure we have the latest data
        await this.server.updateSquadList();

        let teamID;
        let squadIDs = [];
        let teamInput = null;

        if (commandSplit.length > 0 && isNaN(commandSplit[0])) {
            // team specifier
            if (!isAdmin) {
                this.server.rcon.warn(info.steamID, 'Only admins can check squads of other teams. \nFor help use -> !' + this.options.commandPrefix + ' help');
                return;
            }

            teamInput = commandSplit[0];
            squadIDs = commandSplit.slice(1);
            teamID = await this.getTeamIdFromInput(teamInput, info);
            if (teamID === null) {
                return;
            }
        } else {
            // own team
            squadIDs = commandSplit;
            teamID = info.player.teamID;
        }

        if (squadIDs.some(s => isNaN(s))) {
            this.server.rcon.warn(info.steamID, 'Invalid squad ID provided. \nFor help use -> !' + this.options.commandPrefix + ' help');
            return;
        }

        // validate squad IDs
        if (squadIDs.length <= 1) {
            this.server.rcon.warn(info.steamID, 'Please provide at least two squad IDs. \nFor help use -> !' + this.options.commandPrefix + ' help');
            return;
        }

        // remove duplicates
        const uniqueIDs = [...new Set(squadIDs)];

        // ensure that only existing squads are processed
        const existingIds = uniqueIDs.filter(squadID => this.createdSquadsTeam[teamID][squadID] !== undefined);
        if (existingIds.length <= 1) {
            this.server.rcon.warn(info.steamID, 'Please provide at least two existing squad IDs.');
            return;
        }

        const squads = existingIds.map(squadID => this.createdSquadsTeam[teamID][squadID]);
        const lines = this.getSquadListBeautified(squads);
        await this.warnInChunks(info.steamID, lines);

        const missing = uniqueIDs.filter(squadID => this.createdSquadsTeam[teamID][squadID] === undefined);
        if (missing.length > 0) {
            // delay the missing warn to improve visibility
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            await sleep(6000);
            this.server.rcon.warn(
                info.steamID,
                `Custom Squad IDs not found in ${teamInput ? `team: ${teamInput}` : 'your team'}: ${missing.join(', ')}`
            );
        }
    }

    getSquadListBeautified(squads) {
        const sortedSquads = squads
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        let counter = 1;
        const lines = [];

        sortedSquads.forEach((item) => {
            // skip squads that no longer exist
            // don't remove in debug mode
            if (!this.doesSquadExist(item.teamID, item.squadID) && this.options.debugPlugin === false) {
                delete this.createdSquadsTeam[item.teamID][item.squadID];
                return;
            }

            const shortName = item.squadName.substring(0, 10) ?? 'Unnamed';
            lines.push(
                `${counter}. Squad ${item.squadID}[${shortName}], created ${this.formatTime(item.time)}`
            );
            counter += 1;
        });

        return lines;
    }

    async warnInChunks(steamID, lines, chunkSize = 5) {
        if (!Array.isArray(lines) || lines.length === 0) {
            return;
        }

        async function showSquadComparison() {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const delayMs = 500;

            for (let i = 0; i < lines.length; i += chunkSize) {
                const chunk = lines.slice(i, i + chunkSize);
                this.server.rcon.warn(steamID, chunk.join('\n'));

                if (delayMs > 0 && i + chunkSize < lines.length) {
                    await sleep(delayMs);
                }
            }
        }

        // show comparison messages twice with delay to improve visibility
        for (let i = 0; i < 2; i++) {
            await showSquadComparison.call(this);
            if (i !== 1) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
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
        const prefix = '!' + this.options.commandPrefix;
        return [
            prefix + ' id1 id2 [id3 ...] - compare X squads',
        ].join('\n \n');
    }

    getHelpMessageExamplesForPlayer() {
        const prefix = '!' + this.options.commandPrefix;
        return [
            'Examples:',
            prefix + ' 1 3',
            prefix + ' 1 3 5',
            prefix + ' 1 3 4 5',
        ].join('\n');
    }

    getHelpMessageForAdmin() {
        const prefix = '!' + this.options.commandPrefix;
        return [
            prefix + ' id1 id2 [id3 ...] - compare X squads',
            prefix + ' team id1 id2 [id3 ...] - compare X squads of a team',
            prefix + ' other id1 id2 [id3 ...] - compare X squads of the opposite team',
        ].join('\n \n');
    }

    getHelpMessageExamplesForAdmin() {
        const prefix = '!' + this.options.commandPrefix;
        return [
            'Examples:',
            prefix + ' 1 3',
            prefix + ' rgf 1 3',
            prefix + ' wpmc 1 3 4',
            prefix + ' other 1 3',
            prefix + ' other 1 3 4',
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