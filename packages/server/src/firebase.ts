import admin from "firebase-admin";
import { addSystemError } from "./services/engine.js";

export function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Replace actual literal newlines if passed in env
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId) {
    console.warn(
      "FIREBASE_PROJECT_ID not set. Firestore will not be initialized.",
    );
    return;
  }

  try {
    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      admin.initializeApp({
        projectId,
      });
    }
    console.log("Firebase Admin Initialized");
  } catch (err: any) {
    console.error("Firebase Admin Init Error:", err);
    addSystemError(`Firebase Admin Init Error: ${err.message}`);
  }
}

export function getFirestore() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }
  return null;
}
