import { SlashCommandBuilder } from '@discordjs/builders';

const statsCommand = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View current group stats');

export default statsCommand.toJSON();