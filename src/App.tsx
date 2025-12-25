import { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import './App.css';

const SHOP_NAME = 'بيت الغسيل والكوي';
const SHOP_PHONE = '0791112838';
const SHOP_ADDR = 'ناعور - مجمع سعود التجاري';

function App() {
  // --- حالات نظام الشفتات والأرشفة ---
  const [shiftsArchive, setShiftsArchive] = useState<any[]>([]);
  const [currentShiftInfo, setCurrentShiftInfo] = useState({ type: 'صباحي', employee: '' });
  const [showShiftArchiveModal, setShowShiftArchiveModal] = useState(false);
  const [view, setView] = useState('pos');
  const [loading, setLoading] = useState(false);

  // --- البيانات الأساسية ---
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [fin, setFin] = useState({ cash: 0, visa: 0, cliq: 0, total: 0, exp: 0, debt: 0 });
  const [currentShiftData, setCurrentShiftData] = useState({ cash: 0, visa: 0, cliq: 0, exp: 0 });
  const [cashFloat, setCashFloat] = useState('0');

  // --- حالات الفاتورة POS ---
  const [invoiceClientName, setInvoiceClientName] = useState('');
  const [invoiceClientPhone, setInvoiceClientPhone] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('مدفوع');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [tailoringNotes, setTailoringNotes] = useState('');
  const [hasStains, setHasStains] = useState(false);
  const [qty, setQty] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [category, setCategory] = useState('');
  const [lastInvoice, setLastInvoice] = useState<any>(null);

  // --- البحث والمودالات ---
  const [searchInvNum, setSearchInvNum] = useState('');
  const [searchInvDate, setSearchInvDate] = useState('');
  const [deliveryModal, setDeliveryModal] = useState<any>(null);
  const [shiftModal, setShiftModal] = useState(false);
  const [customerStatement, setCustomerStatement] = useState<any>(null);
  const [showInvDetail, setShowInvDetail] = useState<any>(null);

  // --- الإعدادات والمصاريف ---
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expImage, setExpImage] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatPrice, setNewCatPrice] = useState('');
  const [newCrmName, setNewCrmName] = useState('');
  const [newCrmPhone, setNewCrmPhone] = useState('');

  // --- الجلب التلقائي للبيانات ---
  useEffect(() => {
    onSnapshot(collection(db, 'products'), (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'customers'), (snap) => setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    
    const qShifts = query(collection(db, "shifts_archive"), orderBy("timestamp", "desc"));
    onSnapshot(qShifts, (snapshot) => setShiftsArchive(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

    fetchFinancials();
  }, []);

  const fetchFinancials = async () => {
    const s_inv = await getDocs(collection(db, 'invoices'));
    const s_exp = await getDocs(collection(db, 'expenses'));
    const s_shifts = await getDocs(query(collection(db, 'shifts_archive'), orderBy('timestamp', 'desc')));
    
    const lastShift = s_shifts.docs[0]?.data();
    const lastCloseTime = lastShift?.timestamp?.toDate() || new Date(0);
    if (lastShift) setCashFloat(lastShift.nextFloat || '0');

    let stats = { cash: 0, visa: 0, cliq: 0, total: 0, exp: 0, debt: 0 };
    let shiftStats = { cash: 0, visa: 0, cliq: 0, exp: 0 };

    const invs = s_inv.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      dateStr: d.data().createdAt?.toDate().toLocaleString('ar-EG'),
      fullDate: d.data().createdAt?.toDate().toISOString().split('T')[0],
    }));
    setInvoicesList(invs);

    s_inv.docs.forEach((d) => {
      const i = d.data();
      if (i.orderStatus !== 'ملغية') {
        const paid = i.amountPaidAtStart || 0;
        const rem = i.totalAmount - paid;
        const isNew = i.createdAt.toDate() > lastCloseTime;

        const updateStats = (method: string, amt: number) => {
          if (method === 'Cash') { stats.cash += amt; if (isNew) shiftStats.cash += amt; }
          if (method === 'Visa') { stats.visa += amt; if (isNew) shiftStats.visa += amt; }
          if (method === 'CliQ') { stats.cliq += amt; if (isNew) shiftStats.cliq += amt; }
        };

        updateStats(i.paymentMethod, paid);
        if (i.deliveryPayMethod) updateStats(i.deliveryPayMethod, rem);
        if (i.orderStatus !== 'تم الاستلام' || i.deliveryPayMethod === 'Debt') stats.debt += i.remainingAmount;
      }
    });

    s_exp.docs.forEach((d) => {
      stats.exp += d.data().amount;
      if (d.data().createdAt.toDate() > lastCloseTime) shiftStats.exp += d.data().amount;
    });

    stats.total = stats.cash + stats.visa + stats.cliq;
    setCurrentShiftData(shiftStats);
    setFin(stats);
    setExpensesList(s_exp.docs.map((d) => ({ id: d.id, ...d.data(), dateStr: d.data().createdAt?.toDate().toLocaleString('ar-EG') })));
  };

  const handleSaveInvoice = async () => {
    const total = cart.reduce((a, b) => a + b.total, 0);
    let paid = paymentStatus === 'مدفوع' ? total : paymentStatus === 'جزئي' ? Number(amountPaid) : 0;
    try {
      const invData = {
        invoiceNumber: (invoicesList.length + 1).toString(),
        clientName: invoiceClientName, clientPhone: invoiceClientPhone,
        deliveryDate, items: cart, totalAmount: total, amountPaidAtStart: paid,
        remainingAmount: total - paid, paymentMethod, orderStatus: 'تحت التجهيز',
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'invoices'), invData);
      setLastInvoice({ ...invData, dateStr: new Date().toLocaleString('ar-EG'), delDateStr: new Date(deliveryDate).toLocaleString('ar-EG') });
      setCart([]); setInvoiceClientName(''); setInvoiceClientPhone('');
      setTimeout(() => { window.print(); fetchFinancials(); }, 800);
    } catch (e) { alert('خطأ في الحفظ!'); }
  };

  const handleArchiveShift = async () => {
    if (!currentShiftInfo.employee) return alert("الرجاء إدخال اسم الموظف");
    try {
      await addDoc(collection(db, "shifts_archive"), {
        type: currentShiftInfo.type,
        employee: currentShiftInfo.employee,
        cash: currentShiftData.cash,
        visa: currentShiftData.visa,
        cliq: currentShiftData.cliq,
        expenses: currentShiftData.exp,
        netCash: (currentShiftData.cash - currentShiftData.exp),
        nextFloat: cashFloat,
        date: new Date().toLocaleDateString('ar-EG'),
        timestamp: serverTimestamp()
      });
      setShiftModal(false);
      alert("تمت أرشفة الشفت بنجاح ✅");
      fetchFinancials();
    } catch (e) { console.error(e); }
  };

  const navBtn = (v: string, label: string, emoji: string) => (
    <button onClick={() => setView(v)} className={`nav-item ${view === v ? 'active' : ''}`}>
      <span>{emoji}</span> {label}
    </button>
  );

  return (
    <div className="app-container">
      <style>{`
        .app-container { background: #f8fafc; min-height: 100vh; padding: 20px; direction: rtl; font-family: 'Segoe UI', Tahoma; }
        @media print { .no-print { display: none !important; } #print-area { display: block !important; width: 80mm; } .receipt-sep { page-break-after: always; border-bottom: 2px dashed #000; margin-bottom: 30px; padding-bottom: 20px; } }
        .card { background: #fff; padding: 25px; border-radius: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #f1f5f9; }
        .nav-item { padding: 12px 18px; background: #fff; color: #4b5563; border: 1px solid #e2e8f0; border-radius: 15px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; transition: 0.3s; }
        .nav-item.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        input, select { width: 100%; padding: 14px; margin-bottom: 12px; border-radius: 12px; border: 1px solid #cbd5e1; box-sizing: border-box; font-size: 16px; }
        .btn-main { background: #4f46e5; color: white; border: none; padding: 16px; border-radius: 14px; font-weight: bold; width: 100%; cursor: pointer; font-size: 16px; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2000; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .badge { padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold; }
      `}</style>

      {/* --- مودال إغلاق الشفت --- */}
      {shiftModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{ width: '400px', textAlign: 'center' }}>
            <h3 style={{ color: '#4f46e5' }}>🕒 تسليم وإغلاق الشفت</h3>
            <div style={{ textAlign: 'right', background: '#f8fafc', padding: '15px', borderRadius: '15px' }}>
              <select onChange={(e) => setCurrentShiftInfo({...currentShiftInfo, type: e.target.value})}>
                <option value="صباحي">شفت صباحي</option>
                <option value="مسائي">شفت مسائي</option>
              </select>
              <input type="text" placeholder="اسم الموظف" onChange={(e) => setCurrentShiftInfo({...currentShiftInfo, employee: e.target.value})} />
              <p>💰 كاش الصندوق: <b>{(currentShiftData.cash - currentShiftData.exp).toFixed(2)}</b></p>
              <p>💳 فيزا: {currentShiftData.visa.toFixed(2)} | 📱 كليك: {currentShiftData.cliq.toFixed(2)}</p>
              <label>💵 مبلغ الأرضية للبقاء:</label>
              <input type="number" value={cashFloat} onChange={(e) => setCashFloat(e.target.value)} />
            </div>
            <button className="btn-main" style={{ marginTop: '15px', background: '#10b981' }} onClick={handleArchiveShift}>تأكيد وأرشفة الشفت ✅</button>
            <button onClick={() => setShiftModal(false)} style={{ marginTop: '10px', border: 'none', background: 'none' }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* --- مودال أرشيف الشفتات اليومية --- */}
      {showShiftArchiveModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{ width: '95%', maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontWeight: 'bold' }}>📂 أرشيف الشفتات اليومي</h2>
              <button onClick={() => setShowShiftArchiveModal(false)} style={{ fontSize: '24px', border: 'none', background: 'none' }}>×</button>
            </div>
            <table style={{ width: '100%', textAlign: 'right', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '10px' }}>التاريخ</th>
                  <th>الشفت</th>
                  <th>الموظف</th>
                  <th>الصافي كاش</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {shiftsArchive.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>{s.date}</td>
                    <td><span className="badge" style={{background: '#e0f2fe'}}>{s.type}</span></td>
                    <td>{s.employee}</td>
                    <td style={{color: '#10b981', fontWeight: 'bold'}}>{s.netCash?.toFixed(2)}</td>
                    <td>{(s.cash + s.visa + s.cliq).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- شريط التنقل الرئيسي --- */}
      <div className="no-print" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px', flexWrap: 'wrap' }}>
        {navBtn('pos', 'استقبال', '🧺')}
        {navBtn('tracking', 'متابعة', '🚚')}
        {navBtn('archive', 'أرشيف', '📑')}
        <button onClick={() => setShiftModal(true)} className="nav-item" style={{background: '#fff4e5'}}><span>🕒</span> إغلاق شفت</button>
        <button onClick={() => setShowShiftArchiveModal(true)} className="nav-item" style={{background: '#e0f2fe'}}><span>📂</span> أرشيف الشفتات</button>
        {navBtn('crm', 'عملاء', '👥')}
        {navBtn('expenses', 'مصاريف', '💸')}
        {navBtn('reports', 'ميزانية', '📊')}
        {navBtn('settings', 'إعدادات', '⚙️')}
      </div>

      {/* --- محتوى الواجهات --- */}
      {view === 'pos' && (
        <div className="no-print" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="card">
            <h3>🧾 فاتورة جديدة</h3>
            <input type="text" placeholder="اسم الزبون" value={invoiceClientName} onChange={(e) => setInvoiceClientName(e.target.value)} />
            <input type="tel" placeholder="رقم الهاتف" value={invoiceClientPhone} onChange={(e) => setInvoiceClientPhone(e.target.value)} />
            <input type="datetime-local" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            <div className="grid-2">
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Cash">كاش 💵</option>
                <option value="Visa">فيزا 💳</option>
                <option value="CliQ">كليك 📱</option>
              </select>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                <option value="مدفوع">مدفوع كامل</option>
                <option value="جزئي">عربون</option>
                <option value="غير مدفوع">ذمة</option>
              </select>
            </div>
            {paymentStatus === 'جزئي' && <input type="number" placeholder="المبلغ المقبوض" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff4e5', padding: '15px', borderRadius: '15px', marginBottom: '15px', border: '1px solid #ffe2b3' }}>
              <input type="checkbox" checked={hasStains} onChange={(e) => setHasStains(e.target.checked)} style={{ width: '25px', height: '25px', margin: 0 }} />
              <label style={{ fontWeight: 'bold', color: '#856404' }}>⚠️ إزالة بقع متعبة</label>
            </div>
            <input type="text" placeholder="ملاحظات إضافية..." value={tailoringNotes} onChange={(e) => setTailoringNotes(e.target.value)} />
            <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
              <select value={category} onChange={(e) => { setCategory(e.target.value); const p = products.find((x) => x.name === e.target.value); setPricePerUnit(p?.defaultPrice || ''); }}>
                <option value="">اختر الصنف</option>
                {products.map((p) => ( <option key={p.id} value={p.name}>{p.name}</option> ))}
              </select>
              <input type="number" placeholder="العدد" value={qty} onChange={(e) => setQty(e.target.value)} />
              <input type="number" placeholder="سعر" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} />
            </div>
            <button className="btn-main" onClick={() => { if (qty) { setCart([...cart, { id: Date.now(), category, qty: Number(qty), price: Number(pricePerUnit), total: Number(qty) * Number(pricePerUnit), hasStains, notes: tailoringNotes }]); setQty(''); setTailoringNotes(''); setHasStains(false); } }}>إضافة للطلب +</button>
          </div>
          {cart.length > 0 && (
            <div className="card">
              {cart.map((item, idx) => ( <div key={idx} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}><strong>{item.category}</strong> x{item.qty} = {item.total.toFixed(2)} د.أ</div> ))}
              <h2 style={{ color: '#10b981', textAlign: 'center' }}>الإجمالي: {cart.reduce((a, b) => a + b.total, 0).toFixed(2)} د.أ</h2>
              <button className="btn-main" style={{ background: '#10b981' }} onClick={handleSaveInvoice}>✅ حفظ وطباعة الفاتورة</button>
            </div>
          )}
        </div>
      )}

      {view === 'tracking' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {invoicesList.filter(i => i.orderStatus === 'تحت التجهيز' || i.orderStatus === 'تم التجهيز').map((inv) => (
            <div key={inv.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRight: inv.orderStatus === 'تم التجهيز' ? '12px solid #10b981' : '12px solid #f59e0b' }}>
              <div><strong>{inv.clientName} (#{inv.invoiceNumber})</strong><br/><small>المتبقي: {inv.remainingAmount} د.أ</small></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select style={{ width: '110px', margin: 0 }} value={inv.orderStatus} onChange={(e) => updateDoc(doc(db, 'invoices', inv.id), { orderStatus: e.target.value }).then(fetchFinancials)}>
                  <option value="تحت التجهيز">قيد العمل</option>
                  <option value="تم التجهيز">جاهز</option>
                </select>
                <button onClick={() => setDeliveryModal(inv)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px' }}>تسليم</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'crm' && (
        <div style={{ maxWidth: '650px', margin: '0 auto' }}>
          <div className="card">
            <h3>👥 إدارة العملاء والديون</h3>
            <input type="text" placeholder="الاسم" value={newCrmName} onChange={(e) => setNewCrmName(e.target.value)} />
            <input type="tel" placeholder="الهاتف" value={newCrmPhone} onChange={(e) => setNewCrmPhone(e.target.value)} />
            <button className="btn-main" onClick={async () => { if (newCrmName) { await addDoc(collection(db, 'customers'), { name: newCrmName, phone: newCrmPhone }); setNewCrmName(''); fetchFinancials(); } }}>حفظ</button>
          </div>
          {customers.map(c => {
            const debt = invoicesList.filter(i => i.clientPhone === c.phone).reduce((acc, curr) => acc + (curr.orderStatus !== 'ملغية' ? curr.remainingAmount : 0), 0);
            return (
              <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div><strong>{c.name}</strong><br/>{c.phone}</div>
                <div style={{ color: debt > 0 ? 'red' : 'green', fontWeight: 'bold' }}>الذمة: {debt.toFixed(2)} د.أ</div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'expenses' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="card">
            <h3>💸 تسجيل مصروف جديد</h3>
            <input type="text" placeholder="البيان" value={expName} onChange={(e) => setExpName(e.target.value)} />
            <input type="number" placeholder="المبلغ" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
            <input type="file" onChange={(e) => { const f = e.target?.files?.[0]; if (f) { const r = new FileReader(); r.onloadend = () => setExpImage(r.result as string); r.readAsDataURL(f); } }} />
            <button className="btn-main" style={{ background: '#ef4444' }} onClick={async () => { if (expName && expAmount) { await addDoc(collection(db, 'expenses'), { title: expName, amount: Number(expAmount), image: expImage, createdAt: Timestamp.now() }); setExpName(''); setExpAmount(''); setExpImage(null); fetchFinancials(); } }}>حفظ المصروف</button>
          </div>
          {expensesList.map(ex => (
            <div key={ex.id} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{ex.title} ({ex.amount} د.أ)</span>
              {ex.image && <a href={ex.image} target="_blank">🖼️ الفاتورة</a>}
            </div>
          ))}
        </div>
      )}

      {view === 'reports' && (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="grid-2">
            <div className="card" style={{ background: '#4f46e5', color: '#fff' }}>💰 الإيراد الكلي <br /> <h2>{fin.total.toFixed(2)}</h2></div>
            <div className="card" style={{ background: '#ef4444', color: '#fff' }}>💸 المصاريف <br /> <h2>{fin.exp.toFixed(2)}</h2></div>
            <div className="card" style={{ background: '#f59e0b', color: '#fff' }}>📝 ديون خارجة <br /> <h2>{fin.debt.toFixed(2)}</h2></div>
            <div className="card" style={{ background: '#10b981', color: '#fff' }}>💹 صافي الربح <br /> <h2>{(fin.total - fin.exp).toFixed(2)}</h2></div>
          </div>
        </div>
      )}

      {/* --- منطقة الطباعة المخفية --- */}
      <div id="print-area" style={{ display: 'none' }}>
        {lastInvoice && (
          <>
            <div className="receipt-sep"><ReceiptTemplate inv={lastInvoice} title="نسخة العميل" /></div>
            <ReceiptTemplate inv={lastInvoice} title="نسخة المحل" />
          </>
        )}
      </div>

      {/* مودال تسليم الطلب (مكرر لضمان الميزة) */}
      {deliveryModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{ width: '320px', textAlign: 'center' }}>
            <h3>💰 تسليم وتحصيل</h3>
            <p>المطلوب: <strong>{deliveryModal.remainingAmount} د.أ</strong></p>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button onClick={async () => { await updateDoc(doc(db, 'invoices', deliveryModal.id), { orderStatus: 'تم الاستلام', remainingAmount: 0, deliveryPayMethod: 'Cash' }); setDeliveryModal(null); fetchFinancials(); }} style={{ padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px' }}>كاش 💵</button>
              <button onClick={async () => { await updateDoc(doc(db, 'invoices', deliveryModal.id), { orderStatus: 'تم الاستلام', remainingAmount: 0, deliveryPayMethod: 'Visa' }); setDeliveryModal(null); fetchFinancials(); }} style={{ padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px' }}>فيزا 💳</button>
              <button onClick={() => setDeliveryModal(null)} style={{ padding: '10px', background: '#ccc', border: 'none', borderRadius: '10px' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ReceiptTemplate = ({ inv, title }: any) => (
  <div style={{ width: '80mm', padding: '5mm', textAlign: 'center', fontFamily: 'Arial', direction: 'rtl' }}>
    <h2 style={{ margin: '0' }}>{SHOP_NAME}</h2>
    <p style={{ margin: '2px 0', fontSize: '12px' }}>{SHOP_PHONE}</p>
    <div style={{ borderTop: '1px solid #000', margin: '8px 0' }}></div>
    <h3 style={{ background: '#eee', padding: '5px' }}>{title} - #{inv.invoiceNumber}</h3>
    <div style={{ textAlign: 'right', fontSize: '11px' }}>
      <p><b>الزبون:</b> {inv.clientName}</p>
      <p><b>التاريخ:</b> {inv.dateStr}</p>
      <p style={{ color: 'red' }}><b>التسليم:</b> {inv.delDateStr}</p>
    </div>
    <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginTop: '10px' }}>
      <thead><tr style={{ borderBottom: '1px solid #000' }}><th align="right">الصنف</th><th>العدد</th><th>المجموع</th></tr></thead>
      <tbody>
        {inv.items?.map((it: any, idx: number) => (
          <tr key={idx} style={{ borderBottom: '0.5px solid #eee' }}>
            <td style={{ padding: '4px 0' }}>{it.category}{it.hasStains && <p style={{margin:0}}>*بقع</p>}</td>
            <td align="center">{it.qty}</td>
            <td align="center">{it.total.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div style={{ textAlign: 'left', borderTop: '1px solid #000', marginTop: '10px', paddingTop: '5px' }}>
      <p style={{ margin: 0 }}>الإجمالي: {inv.totalAmount.toFixed(2)} د.أ</p>
      <p style={{ margin: 0 }}>المدفوع: {inv.amountPaidAtStart.toFixed(2)} د.أ</p>
      <h3 style={{ margin: 0 }}>المتبقي: {inv.remainingAmount.toFixed(2)} د.أ</h3>
    </div>
    <p style={{ fontSize: '9px', marginTop: '10px' }}>{SHOP_ADDR}</p>
  </div>
);

export default App;