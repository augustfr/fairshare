import { SlashCommandBuilder } from '@discordjs/builders';

const setupCommand = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create group in the current server')
    .addNumberOption(option => 
        option.setName('fee')
            .setDescription("The percentage fee that will be added on to each transaction ('5' for '5%')")
            .setRequired(true))
    .addNumberOption(option => 
        option.setName('income')
            .setDescription('The amount of daily income for each member')
            .setRequired(true))
    .addRoleOption(option =>
		option.setName('general_role')
            .setDescription('The role assigned to each member when they join')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('symbol')
            .setDescription("Currency symbol '$'")
            .setRequired(true))
    .addChannelOption(option =>
        option.setName('feed_channel')
        .setDescription('What channel should transactions be publically sent in?'));

export default setupCommand.toJSON();