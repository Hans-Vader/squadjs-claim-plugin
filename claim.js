import BasePlugin from './base-plugin.js';

export default class Claim extends BasePlugin {
    static get description() {
        return 'Plugin to track and display created squads on the server.';
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            command: {
                required: false,
                description: 'Prefix of the claim command',
                default: "claim"
            },
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onSquadCreated = this.onSquadCreated.bind(this);
        this.onChatCommand = this.onChatCommand.bind(this);
        this.getFactionId = this.getFactionId.bind(this);

        this.createdSquadsTeam = {};
        this.createdSquadsTeam[1] = [];
        this.createdSquadsTeam[2] = [];
    }

    async mount() {
        this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
        this.server.on('SQUAD_CREATED', this.onSquadCreated);
        this.server.on('ROUND_ENDED', this.onRoundEnded)
    }

    async unmount() {
        this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
        this.server.removeEventListener('SQUAD_CREATED', this.onSquadCreated);
        this.server.removeEventListener('ROUND_ENDED', this.onRoundEnded)
    }

    async onRoundEnded() {
        this.createdSquadsTeam = {};
        this.createdSquadsTeam[1] = [];
        this.createdSquadsTeam[2] = [];
    }

    async onSquadCreated(info) {
        const teamID = info.player.squad.teamID;
        const squadID = info.player.squad.squadID;

        const squadCreatedEventData = {
            squadName: info.squadName,
            teamID: teamID,
            squadID: squadID,
            steamID: info.player.steamID,
            time: info.time
        };

        this.createdSquadsTeam[teamID][squadID] = squadCreatedEventData;
    }

    async onChatCommand(info) {
        await this.server.updateSquadList();

        const isAdmin = info.chat === "ChatAdmin";
        const message = info.message.toLowerCase();

        const commandSplit = message.trim().split(' ');

        if (commandSplit[0] === 'help') {
            if (isAdmin) {
                await this.server.rcon.warn(info.steamID, this.getHelpMessageForAdmin());
                await this.server.rcon.warn(info.steamID, this.getHelpMessageExamplesForAdmin());
            } else {
                await this.server.rcon.warn(info.steamID, this.getHelpMessageForPlayer());
                await this.server.rcon.warn(info.steamID, this.getHelpMessageExamplesForPlayer());
            }
            return;
        }

        let teamID = null;
        if (isNaN(commandSplit[0]) && commandSplit[0].length >= 1 && isNaN(commandSplit[1])) {
            // check all squads in a specific team

            if (!isAdmin) {
                await this.server.rcon.warn(info.steamID, 'Only admins can check squads of other teams.');
                return;
            }

            let teamName = commandSplit[0];
            if (teamName === 'other') {
                teamID = info.player.teamID === 1 ? 2 : 1;
            } else {
                teamName = teamName.slice(0, 4);
                let teamID = await this.getFactionId(teamName);
                if (teamID === null) {
                    await this.server.rcon.warn(info.steamID, 'Faction not found.');
                    return;
                }
            }

            const squads = this.createdSquadsTeam[teamID];
            await this.server.rcon.warn(info.steamID, this.getSquadListBeautified(squads));

        } else if (isNaN(commandSplit[0]) && commandSplit[0].length > 1 && !isNaN(commandSplit[1]) && !isNaN(commandSplit[2])) {
            // check two squad in a specific team

            if (!isAdmin) {
                await this.server.rcon.warn(info.steamID, 'Only admins can check squads of other teams.');
                return;
            }
            let teamName = commandSplit[0].slice(0, 4);
            let squadOne = commandSplit[1];
            let squadTwo = commandSplit[2];

            if (squadOne === squadTwo) {
                await this.server.rcon.warn(info.steamID, 'Please provide two different squad IDs.');
                return;
            }

            if (teamName === 'other') {
                teamID = info.player.teamID === 1 ? 2 : 1;
            } else {
                teamName = teamName.slice(0, 4);
                let teamID = await this.getFactionId(teamName);
                if (teamID === null) {
                    await this.server.rcon.warn(info.steamID, 'Faction not found.');
                    return;
                }
            }

            if (this.createdSquadsTeam[teamID][squadOne] === undefined) {
                await this.server.rcon.warn(info.steamID, 'Sqaud one with ID: ' + squadOne + ' not found in tean: ' + teamName);
                return;
            }

            if (this.createdSquadsTeam[teamID][squadTwo] === undefined) {
                await this.server.rcon.warn(info.steamID, 'Sqaud two with ID: ' + squadTwo + ' not found in tean: ' + teamName);
                return;
            }

            await this.server.rcon.warn(info.steamID, this.getSquadListBeautified([
                this.createdSquadsTeam[teamID][squadOne], this.createdSquadsTeam[teamID][squadTwo]
            ]));

        } else if (!isNaN(commandSplit[0]) && !isNaN(commandSplit[1])) {
            // check two squad in your own team
            let squadOne = commandSplit[0];
            let squadTwo = commandSplit[1];
            teamID = info.player.teamID;

            if (squadOne === squadTwo) {
                await this.server.rcon.warn(info.steamID, 'Please provide two different squad IDs.');
                return;
            }

            if (this.createdSquadsTeam[teamID][squadOne] === undefined) {
                await this.server.rcon.warn(info.steamID, 'Sqaud one with ID: ' + squadOne + ' not found in your team.');
                return;
            }

            if (this.createdSquadsTeam[teamID][squadTwo] === undefined) {
                await this.server.rcon.warn(info.steamID, 'Sqaud two with ID: ' + squadTwo + ' not found in your team.');
                return;
            }

            await this.server.rcon.warn(info.steamID, this.getSquadListBeautified([
                this.createdSquadsTeam[teamID][squadOne], this.createdSquadsTeam[teamID][squadTwo]
            ]));

        } else {
            // check all squads in your own team
            teamID = info.player.teamID;
            let squads = this.createdSquadsTeam[teamID];
            await this.server.rcon.warn(info.steamID, this.getSquadListBeautified(squads));
        }
    }

    getSquadListBeautified(squads) {
        let squadListString = "";

        if (!squads || Object.keys(squads).length === 0) return "No squads have been created yet.";

        const sortedSquads = Object.values(squads).sort((a, b) => {
            return new Date(a.time) - new Date(b.time);
        });

        sortedSquads.forEach(item => {
            if (!this.doesSquadExist(item.teamID, item.squadID)) {
                delete squads[item.squadID];
                return;
            }
            squadListString += `Name: ${item.squadName.substring(0, 10)}, ID: ${item.squadID}, Created at: ${this.formatTime(item.time)}\n`;
        });

        return squadListString;
    }

    formatTime(time) {
        const date = new Date(time);
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    doesSquadExist(teamID, squadID) {
        return this.server.squads.some(squad => squad.squadID == squadID && squad.teamID == teamID);
    }

    getHelpMessageForPlayer() {
        return [
            '!claim -> all squads in own team',
            '!claim <id1> <id2> -> compare two squads',
        ].join('\n');
    }

    getHelpMessageExamplesForPlayer() {
        return [
            'Examples:',
            '!claim',
            '!claim 1 3'
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
            '!claim rgf 1 3'
        ].join('\n');
    }

    async getFactionId(team) {
        await this.server.updatePlayerList();

        const firstPlayer = this.server.players.find(p => p.role.toLowerCase().startsWith(team.toLowerCase()))
        if (firstPlayer) return firstPlayer.teamID

        return null;
    }
}
