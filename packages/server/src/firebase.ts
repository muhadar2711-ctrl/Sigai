
import { initializeApp, cert } from 'firebase-admin/app';
import { systemState, addSystemError } from './state/state_manager.js';

export function initFirebase() {
  try {
    const firebaseKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;

    if (!firebaseKeyBase64) {
      throw new Error('FIREBASE_PRIVATE_KEY_BASE64 environment variable not set.');
    }

    // Decode the Base64 string to get the original JSON string
    const serviceAccountJSON = Buffer.from(firebaseKeyBase64, 'base64').toString('utf8');
    
    // Parse the decoded JSON string
    const serviceAccount = JSON.parse(serviceAccountJSON);

    initializeApp({
      credential: cert(serviceAccount),
    });

    console.log("[FIREBASE] Firebase Admin SDK Initialized.");

  } catch (error: any) {
    console.error("[FIREBASE_INIT_ERROR]", error.message); // Tetap log error untuk visibilitas
    addSystemError("FIREBASE_INIT_FAILED", { error: error.message });
  }
}
