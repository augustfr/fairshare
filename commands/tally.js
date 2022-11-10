import { SlashCommandBuilder } from '@discordjs/builders';

const tallyCommand = new SlashCommandBuilder()
    .setName('tally')
    .setDescription('Tally current votes');

export default tallyCommand.toJSON();