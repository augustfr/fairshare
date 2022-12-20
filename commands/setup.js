import { SlashCommandBuilder } from '@discordjs/builders';

const setupCommand = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create group in the current server')
    .addRoleOption(option =>
		option.setName('general_role')
            .setDescription('The role assigned to members once they are accepted')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('name')
            .setDescription("Currency name (example: 'Alpha')")
            .setRequired(true))
    .addChannelOption(option =>
        option.setName('feed_channel')
        .setDescription('What channel should transactions be publically sent in?'))
    .addNumberOption(option => 
        option.setName('fee')
            .setDescription("The percentage fee that will be added on to each transaction ('5' for '5%') (default is 8%)"))
    .addNumberOption(option => 
        option.setName('income')
            .setDescription('The amount of daily income for each member (default is 50)'));

export default setupCommand.toJSON();