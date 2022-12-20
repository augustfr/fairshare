import { SlashCommandBuilder } from '@discordjs/builders';

const WithdrawMembershipCommand = new SlashCommandBuilder()
    .setName('withdraw_membership')
    .setDescription('Withdraw your membership in the current group')
    .addBooleanOption(option =>
		option.setName('confirm')
			.setDescription('Select true to move forward with the withdrawal')
            .setRequired(true));

export default WithdrawMembershipCommand.toJSON();