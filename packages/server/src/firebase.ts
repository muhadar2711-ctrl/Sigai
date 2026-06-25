
import { initializeApp, cert } from 'firebase-admin/app';
import { systemState, addSystemError } from './state/state_manager.js'; 

export function initFirebase() {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_PRIVATE_KEY || '');
        initializeApp({
            credential: cert(serviceAccount),
            // ... other config
        });
        console.log("[FIREBASE] Firebase Admin SDK Initialized");
    } catch (error: any) {
        addSystemError("FIREBASE_INIT_FAILED", { error: error.message });
    }
}
