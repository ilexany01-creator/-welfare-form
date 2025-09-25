// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js
";
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js
";
import { getFirestore, doc, addDoc, collection, onSnapshot, query, getDocs, setDoc, updateDoc, deleteDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js
";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js
";

// Global variables provided by the Canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDm1la2IvhjrXIMUR39QLrOpkkZRW66s08",
  authDomain: "welfare-form-72160.firebaseapp.com",
  projectId: "welfare-form-72160",
  storageBucket: "welfare-form-72160.appspot.com",
  messagingSenderId: "441033441257",
  appId: "1:441033441257:web:80bf6daa99bbc86ee31578"
};

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app, db, auth, storage;
let userId = '';

const modalState = {
    successModal: document.getElementById('success-modal'),
    messageModal: document.getElementById('message-modal'),
};

function showMessage(title, message, isError = false) {
    const modal = modalState.messageModal;
    const titleElem = modal.querySelector('#message-title');
    const messageElem = modal.querySelector('#message-body');
    
    titleElem.textContent = title;
    messageElem.textContent = message;
    titleElem.className = isError ? 'text-2xl font-bold mb-4 text-red-600' : 'text-2xl font-bold mb-4 text-green-600';
    
    modal.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
    if (Object.keys(firebaseConfig).length > 0) {
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            storage = getStorage(app);

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    userId = user.uid;
                    console.log(`Authenticated as user with UID: ${userId}`);
                } else {
                    userId = crypto.randomUUID();
                    console.log("No user signed in, using random UUID.");
                }
            });

            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
                console.log("Firebase signed in with custom token.");
            } else {
                await signInAnonymously(auth);
                console.log("Firebase signed in anonymously.");
            }

            setupRealtimeListener();
            setupQRListeners();
            setupMainImageListeners();
        } catch (error) {
            console.error("Firebase initialization or sign-in failed:", error);
        }
    } else {
        console.warn("Firebase config not available. Data will not be saved.");
    }
});

async function uploadFileToStorage(file, path) {
    if (!storage) throw new Error("Firebase Storage is not initialized.");
    const storageRef = ref(storage, `/artifacts/${appId}/public/images/${path}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
            },
            (error) => {
                console.error("Upload failed:", error);
                reject(error);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
}

function setupRealtimeListener() {
    if (!db || !auth) return;
    const collectionPath = `/artifacts/${appId}/public/data/registrations`;
    const q = query(collection(db, collectionPath));
    
    onSnapshot(q, (snapshot) => {
        const count = snapshot.docs.length;
        document.getElementById('registration-count').textContent = count;
        updateAdminPanel(snapshot.docs);
    }, (error) => {
        console.error("Error listening to collection:", error);
    });
}

function setupQRListeners() {
    if (!db) return;
    const docRef = doc(db, `/artifacts/${appId}/public/data/qr_codes`, 'qr_links');
    onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if (data.qr1) document.getElementById('qr-1').src = data.qr1;
            if (data.qr2) document.getElementById('qr-2').src = data.qr2;
            if (data.qr3) document.getElementById('qr-3').src = data.qr3;
            if (data.qr4) document.getElementById('qr-4').src = data.qr4;
        }
    });
}

function setupMainImageListeners() {
    if (!db) return;
    const docRef = doc(db, `/artifacts/${appId}/public/data/main_images`, 'image_links');
    onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if (data.img1) document.getElementById('main-img-1').src = data.img1;
            if (data.img2) document.getElementById('main-img-2').src = data.img2;
            if (data.img3) document.getElementById('main-img-3').src = data.img3;
            if (data.img4) document.getElementById('main-img-4').src = data.img4;
        }
    });
}

document.getElementById('submit-btn').addEventListener('click', async (event) => {
    event.preventDefault();
    const transactionIdInput = document.getElementById('transaction_id');
    const paymentProofInput = document.getElementById('payment_proof');
    const errorMessageDiv = document.getElementById('error-message');
    const form = document.getElementById('registration-form');

    errorMessageDiv.classList.add('hidden');
    if (!transactionIdInput.value.trim() || paymentProofInput.files.length === 0) {
        errorMessageDiv.classList.remove('hidden');
        return;
    }

    if (!db) {
        showMessage('فارم جمع کرانے میں ناکامی', 'Firestore شروع نہیں ہو سکا۔', true);
        return;
    }
    
    showMessage('براہ کرم انتظار کریں', 'آپ کا فارم جمع کیا جا رہا ہے...', false);

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.timestamp = new Date().toISOString();
    data.isPaid = false;
    
    try {
        const paymentProofFile = paymentProofInput.files[0];
        const paymentProofPath = `payment_proofs/${Date.now()}_${paymentProofFile.name}`;
        const paymentProofURL = await uploadFileToStorage(paymentProofFile, paymentProofPath);
        data.payment_proof_url = paymentProofURL;

        const damagedHouseFiles = document.getElementById('damaged_house_images').files;
        if (damagedHouseFiles.length > 0) {
            const damagedHouseUrls = await Promise.all(Array.from(damagedHouseFiles).map(file => {
                const path = `damaged_houses/${Date.now()}_${file.name}`;
                return uploadFileToStorage(file, path);
            }));
            data.damaged_house_images = damagedHouseUrls;
        }
        
        const cnicFrontFile = document.getElementById('cnic_front').files[0];
        if (cnicFrontFile) {
            const cnicFrontPath = `cnic_fronts/${Date.now()}_${cnicFrontFile.name}`;
            data.cnic_front_url = await uploadFileToStorage(cnicFrontFile, cnicFrontPath);
        }
        
        const cnicBackFile = document.getElementById('cnic_back').files[0];
        if (cnicBackFile) {
            const cnicBackPath = `cnic_backs/${Date.now()}_${cnicBackFile.name}`;
            data.cnic_back_url = await uploadFileToStorage(cnicBackFile, cnicBackPath);
        }

        const docRef = await addDoc(collection(db, `/artifacts/${appId}/public/data/registrations`), data);
        console.log("Document successfully written with ID:", docRef.id);
        showMessage('شکریہ!', 'آپ کا فارم کامیابی سے جمع ہو گیا ہے۔');
        form.reset();
    } catch (e) {
        console.error("Error adding document or uploading image: ", e);
        showMessage('فارم جمع کرانے میں ناکامی', 'آپ کا فارم جمع نہیں ہو سکا۔ برائے مہربانی دوبارہ کوشش کریں۔', true);
    }
});

document.getElementById('check-payment-btn').addEventListener('click', async () => {
    const cnicInput = document.getElementById('check-cnic').value;
    const resultDiv = document.getElementById('payment-check-result');
    resultDiv.innerHTML = '<p>ڈیٹا چیک کیا جا رہا ہے...</p>';

    if (!db) {
        console.error("Firestore is not initialized.");
        return;
    }
    
    try {
        const registrationsCollection = collection(db, `/artifacts/${appId}/public/data/registrations`);
        const q = query(registrationsCollection, where("cnic", "==", cnicInput));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            resultDiv.innerHTML = '<p class="text-red-500">معذرت، اس شناختی کارڈ نمبر کے لیے کوئی اندراج نہیں ملا۔</p>';
        } else {
            const doc = snapshot.docs[0];
            const data = doc.data();
            if (data.isPaid) {
                resultDiv.innerHTML = `
                    <p class="text-green-500 font-bold text-xl">کامیاب! آپ کی فیس کی ادائیگی کی تصدیق ہو گئی ہے۔</p>
                    <p class="mt-2">نام: ${data.name}</p>
                    <p>ٹرانزیکشن آئی ڈی: ${data.transaction_id}</p>
                    <p class="mt-4 font-bold">یہ آپ کی تصدیقی سلپ ہے۔</p>
                    <div class="mt-2 p-4 border rounded-md">
                        <p class="font-bold text-center">رجسٹریشن سلپ</p>
                        <p>نام: ${data.name}</p>
                        <p>شناختی کارڈ نمبر: ${data.cnic}</p>
                        <p>ادائیگی کی حیثیت: <span class="text-green-500">Paid</span></p>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `<p class="text-yellow-500">آپ کی ادائیگی زیر التوا ہے۔ برائے مہربانی ایڈمن سے رابطہ کریں۔</p>`;
            }
        }
    } catch (e) {
        console.error("Error checking payment status: ", e);
        resultDiv.innerHTML = '<p class="text-red-500">ڈیٹا چیک کرنے میں کوئی مسئلہ پیش آیا ہے۔</p>';
    }
});

window.onclick = function(event) {
    if (event.target === modalState.successModal) {
        modalState.successModal.style.display = "none";
    }
    if (event.target === modalState.messageModal) {
        modalState.messageModal.style.display = "none";
    }
}

document.getElementById('admin-login-btn').addEventListener('click', () => {
    const password = prompt("ایڈمن پاس ورڈ درج کریں");
    if (password === "admin123") {
        document.getElementById('admin-login-form').classList.add('hidden');
        document.getElementById('admin-panel-content').classList.remove('hidden');
        showMessage('ایڈمن پینل', 'آپ ایڈمن پینل میں لاگ ان ہو گئے ہیں۔');
    } else {
        showMessage('غلط پاس ورڈ', 'براہ کرم صحیح پاس ورڈ درج کریں۔', true);
    }
});

function updateAdminPanel(docs) {
    const tableBody = document.getElementById('registrations-table-body');
    tableBody.innerHTML = '';
    docs.forEach(doc => {
        const data = doc.data();
        const tr = document.createElement('tr');
        tr.className = `border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${data.isPaid ? 'bg-green-100 dark:bg-green-900/50' : ''}`;
        tr.innerHTML = `
            <td class="px-6 py-4">${data.name || 'N/A'}</td>
            <td class="px-6 py-4 english-text">${data.cnic || 'N/A'}</td>
            <td class="px-6 py-4 english-text">${data.transaction_id || 'N/A'}</td>
            <td class="px-6 py-4">${data.isPaid ? 'ادائیگی ہو گئی' : 'زیر التوا'}</td>
            <td class="px-6 py-4">
                <button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-full text-sm mark-paid-btn" data-doc-id="${doc.id}" ${data.isPaid ? 'disabled' : ''}>
                    <i class="fas fa-check"></i> Paid
                </button>
                <button class="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-full text-sm delete-btn" data-doc-id="${doc.id}">
                    <i class="fas fa-trash-alt"></i> Delete
                </button>
                <a href="${data.payment_proof_url}" target="_blank" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-1 px-3 rounded-full text-sm inline-block mt-2">
                    <i class="fas fa-file-invoice"></i> رسید دیکھیں
                </a>
            </td>
        `;
        tableBody.appendChild(tr);
    });
    
    document.querySelectorAll('.mark-paid-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const docId = e.target.dataset.docId;
            await markAsPaid(docId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const docId = e.target.dataset.docId;
            await deleteRegistration(docId);
        });
    });
}

async function markAsPaid(docId) {
    if (!db) return;
    try {
        const docRef = doc(db, `/artifacts/${appId}/public/data/registrations`, docId);
        await updateDoc(docRef, {
            isPaid: true
        });
        showMessage('کامیابی', 'ادائیگی کو کامیابی سے نشان زد کر دیا گیا ہے۔');
    } catch (e) {
        console.error("Error updating document:", e);
        showMessage('ناکام', 'ادائیگی کو نشان زد کرنے میں مسئلہ پیش آیا۔', true);
    }
}

async function deleteRegistration(docId) {
    if (!db) return;
    try {
        const docRef = doc(db, `/artifacts/${appId}/public/data/registrations`, docId);
        await deleteDoc(docRef);
        showMessage('کامیابی', 'اندراج کامیابی سے ڈیلیٹ ہو گیا ہے۔');
    } catch (e) {
        console.error("Error deleting document:", e);
        showMessage('ناکام', 'اندراج ڈیلیٹ کرنے میں مسئلہ پیش آیا۔', true);
    }
}

