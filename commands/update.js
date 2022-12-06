import { SlashCommandBuilder } from '@discordjs/builders';

const updateCommand = new SlashCommandBuilder()
    .setName('update')
    .setDescription('Update group settings')
    .addRoleOption(option =>
		option.setName('general_role')
            .setDescription('The role assigned to each member when they join'))
    .addStringOption(option =>
        option.setName('name')
            .setDescription("Currency name 'Alpha'"))
    .addChannelOption(option =>
        option.setName('feed_channel')
            .setDescription('What channel should transactions be publically sent in?'))
    .addBooleanOption(option =>
        option.setName('remove_feed')
            .setDescription('Set to true to remove a public feed for transactions'));

export default updateCommand.toJSON();