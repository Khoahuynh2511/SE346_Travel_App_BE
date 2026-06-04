import { emailService } from './src/services/email.service.js';

async function run() {
  try {
    await emailService.sendVerificationEmail('buitung6705@gmail.com', 'test-token');
    console.log('Email test success');
  } catch (e: any) {
    console.error('Email test failed:', e.message);
  }
}

run().catch(console.error).finally(() => process.exit(0));
