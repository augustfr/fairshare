import { SlashCommandBuilder } from '@discordjs/builders';

const unendorseCommand = new SlashCommandBuilder()
    .setName('unendorse')
    .setDescription('Unendorse a user')
    .addUserOption(option => 
        option.setName('user')
            .setDescription("The user you'd like to unendorse")
            .setRequired(true));

export default unendorseCommand.toJSON();