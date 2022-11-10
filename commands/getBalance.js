import { SlashCommandBuilder } from '@discordjs/builders';

const balanceCommand = new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your current balance');

export default balanceCommand.toJSON();