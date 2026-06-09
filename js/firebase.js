// js/firebase.js — инициализация Firebase Storage
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getStorage, ref, listAll, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
  apiKey:            'AIzaSyBwcFdCD6Wvv2CbKYWHUSAyD6Dde_egPtg',
  authDomain:        'sleeplessdog-1381f.firebaseapp.com',
  projectId:         'sleeplessdog-1381f',
  storageBucket:     'sleeplessdog-1381f.firebasestorage.app',
  messagingSenderId: '304058036548',
  appId:             '1:304058036548:web:af56e26d91e7712649a711',
};

const app     = initializeApp(firebaseConfig);
const storage = getStorage(app);

export { storage, ref, listAll, getDownloadURL };
