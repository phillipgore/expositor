import { db } from './db/index.js';
import { verification, user } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { BETTER_AUTH_URL, MANDRILL_KEY } from '$env/static/private';
import mailchimp from '@mailchimp/mailchimp_transactional';

/**
 * Generate a secure verification token
 * @returns {string}
 */
function generateVerificationToken() {
	return randomBytes(32).toString('hex');
}

/**
 * Create a verification token for email verification
 * @param {string} email
 * @returns {Promise<string>}
 */
export async function createEmailVerificationToken(email) {
	const token = generateVerificationToken();
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

	await db.insert(verification).values({
		id: crypto.randomUUID(),
		identifier: email,
		value: token,
		expiresAt,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	return token;
}

/**
 * Verify an email verification token
 * @param {string} token
 * @returns {Promise<{success: boolean, email?: string, error?: string}>}
 */
export async function verifyEmailToken(token) {
	try {
		console.log('🔍 Attempting to verify token:', token);
		
		// Find the verification token
		const verificationRecord = await db
			.select()
			.from(verification)
			.where(eq(verification.value, token))
			.limit(1);

		console.log('📋 Verification record found:', verificationRecord.length > 0);

		if (verificationRecord.length === 0) {
			console.log('❌ No verification record found for token');
			return { success: false, error: 'Invalid verification token' };
		}

		const record = verificationRecord[0];
		console.log('📧 Email to verify:', record.identifier);
		console.log('⏰ Token expires at:', record.expiresAt);
		console.log('🕐 Current time:', new Date());

		// Check if token is expired
		if (record.expiresAt < new Date()) {
			console.log('❌ Token has expired');
			// Delete expired token
			await db.delete(verification).where(eq(verification.id, record.id));
			return { success: false, error: 'Verification token has expired' };
		}

		console.log('✅ Token is valid, updating user...');

		// Update user's emailVerified status
		const updateResult = await db
			.update(user)
			.set({ 
				emailVerified: true,
				updatedAt: new Date()
			})
			.where(eq(user.email, record.identifier))
			.returning();

		console.log('📝 Update result:', updateResult);

		// Delete the used token
		await db.delete(verification).where(eq(verification.id, record.id));
		console.log('🗑️ Token deleted');

		console.log('✅ Email verification successful for:', record.identifier);
		return { success: true, email: record.identifier };
	} catch (error) {
		console.error('❌ Error verifying email token:', error);
		return { success: false, error: 'An error occurred during verification' };
	}
}

/**
 * Create a password reset token
 * @param {string} email
 * @returns {Promise<string>}
 */
export async function createPasswordResetToken(email) {
	const token = generateVerificationToken();
	const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

	await db.insert(verification).values({
		id: crypto.randomUUID(),
		identifier: `password-reset:${email}`,
		value: token,
		expiresAt,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	return token;
}

/**
 * Verify a password reset token
 * @param {string} token
 * @returns {Promise<{success: boolean, email?: string, error?: string}>}
 */
export async function verifyPasswordResetToken(token) {
	try {
		const verificationRecord = await db
			.select()
			.from(verification)
			.where(eq(verification.value, token))
			.limit(1);

		if (verificationRecord.length === 0) {
			return { success: false, error: 'Invalid reset token' };
		}

		const record = verificationRecord[0];

		// Check if token is expired
		if (record.expiresAt < new Date()) {
			await db.delete(verification).where(eq(verification.id, record.id));
			return { success: false, error: 'Reset token has expired' };
		}

		// Extract email from identifier (format: "password-reset:email@example.com")
		const email = record.identifier.replace('password-reset:', '');

		return { success: true, email };
	} catch (error) {
		console.error('Error verifying password reset token:', error);
		return { success: false, error: 'An error occurred during verification' };
	}
}

/**
 * Delete a password reset token after use
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function deletePasswordResetToken(token) {
	await db.delete(verification).where(eq(verification.value, token));
}

/**
 * Send verification email via Mandrill
 * @param {string} email
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail(email, token) {
	const verificationUrl = `${BETTER_AUTH_URL}/verify-email?token=${token}`;
	const mandrillKey = MANDRILL_KEY;
	
	// If no Mandrill key, fall back to console logging (dev mode)
	if (!mandrillKey) {
		console.log('\n=================================');
		console.log('📧 EMAIL VERIFICATION (DEV MODE)');
		console.log('=================================');
		console.log(`To: ${email}`);
		console.log(`Verification URL: ${verificationUrl}`);
		console.log('=================================\n');
		return;
	}

	// Send via Mandrill
	try {
		const mandrillClient = mailchimp(mandrillKey);
		
		const message = {
			from_email: 'phillipagore@me.com',
			from_name: 'Expositor',
			subject: 'Verify Your Email Address',
			to: [
				{
					email: email,
					type: 'to'
				}
			],
			html: `
				<!DOCTYPE html>
				<html>
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Verify Your Email</title>
				</head>
				<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
					<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
						<tr>
							<td align="center">
								<table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
									<tr>
										<td style="padding: 40px 30px; text-align: center;">
											<h1 style="margin: 0 0 20px; color: #333; font-size: 24px;">Verify Your Email Address</h1>
											<p style="margin: 0 0 30px; color: #666; font-size: 16px; line-height: 1.5;">
												Thank you for signing up! Please verify your email address by clicking the button below.
											</p>
											<a href="${verificationUrl}" style="display: inline-block; background-color: #007bff; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 5px; font-size: 16px; font-weight: bold;">
												Verify Email Address
											</a>
											<p style="margin: 30px 0 0; color: #999; font-size: 14px; line-height: 1.5;">
												If the button doesn't work, copy and paste this link into your browser:<br>
												<a href="${verificationUrl}" style="color: #007bff; word-break: break-all;">${verificationUrl}</a>
											</p>
											<p style="margin: 30px 0 0; color: #999; font-size: 12px;">
												This link will expire in 24 hours.
											</p>
										</td>
									</tr>
								</table>
							</td>
						</tr>
					</table>
				</body>
				</html>
			`
		};

		const response = await mandrillClient.messages.send({ message });
		console.log('✅ Verification email sent successfully:', response);
	} catch (error) {
		console.error('❌ Error sending verification email:', error);
		throw error;
	}
}

/**
 * Send password reset email via Mandrill
 * @param {string} email
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(email, token) {
	const resetUrl = `${BETTER_AUTH_URL}/reset-password?token=${token}`;
	const mandrillKey = MANDRILL_KEY;
	
	// If no Mandrill key, fall back to console logging (dev mode)
	if (!mandrillKey) {
		console.log('\n=================================');
		console.log('🔒 PASSWORD RESET (DEV MODE)');
		console.log('=================================');
		console.log(`To: ${email}`);
		console.log(`Reset URL: ${resetUrl}`);
		console.log('=================================\n');
		return;
	}

	// Send via Mandrill
	try {
		const mandrillClient = mailchimp(mandrillKey);
		
		const message = {
			from_email: 'phillipagore@me.com',
			from_name: 'Expositor',
			subject: 'Reset Your Password',
			to: [
				{
					email: email,
					type: 'to'
				}
			],
			html: `
				<!DOCTYPE html>
				<html>
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Reset Your Password</title>
				</head>
				<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
					<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
						<tr>
							<td align="center">
								<table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
									<tr>
										<td style="padding: 40px 30px; text-align: center;">
											<h1 style="margin: 0 0 20px; color: #333; font-size: 24px;">Reset Your Password</h1>
											<p style="margin: 0 0 30px; color: #666; font-size: 16px; line-height: 1.5;">
												We received a request to reset your password. Click the button below to create a new password.
											</p>
											<a href="${resetUrl}" style="display: inline-block; background-color: #007bff; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 5px; font-size: 16px; font-weight: bold;">
												Reset Password
											</a>
											<p style="margin: 30px 0 0; color: #999; font-size: 14px; line-height: 1.5;">
												If the button doesn't work, copy and paste this link into your browser:<br>
												<a href="${resetUrl}" style="color: #007bff; word-break: break-all;">${resetUrl}</a>
											</p>
											<p style="margin: 30px 0 0; color: #999; font-size: 12px;">
												This link will expire in 1 hour. If you didn't request this, please ignore this email.
											</p>
										</td>
									</tr>
								</table>
							</td>
						</tr>
					</table>
				</body>
				</html>
			`
		};

		const response = await mandrillClient.messages.send({ message });
		console.log('✅ Password reset email sent successfully:', response);
	} catch (error) {
		console.error('❌ Error sending password reset email:', error);
		throw error;
	}
}
