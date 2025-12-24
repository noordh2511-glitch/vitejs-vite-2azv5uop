import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyADxRxSUmeX11REIk5Njak5Ht_RSuuHxdw',
  authDomain: 'laundry-and-ironing.firebaseapp.com',
  projectId: 'laundry-and-ironing',
  storageBucket: 'laundry-and-ironing.firebasestorage.app',
  messagingSenderId: '662870112016',
  appId: '1:662870112016:web:1c48d2f21ee7be2c059795',
  measurementId: 'G-LF2G4XR1KH',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
