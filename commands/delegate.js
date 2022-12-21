import { SlashCommandBuilder } from '@discordjs/builders';

const delegateCommand = new SlashCommandBuilder()
    .setName('delegate_endorsements')
    .setDescription('Delegate your endorsing power to another user')
    .addUserOption(option => 
        option.setName('user')
            .setDescription("The user you'd like to delegate to")
            .setRequired(true));

export default delegateCommand.toJSON();