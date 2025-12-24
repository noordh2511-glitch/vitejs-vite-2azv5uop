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
} from 'firebase/firestore';
import './App.css';

const SHOP_NAME = 'بيت الغسيل والكوي';
const SHOP_PHONE = '0791112838';
const SHOP_ADDR = 'ناعور - مجمع سعود التجاري';
const AVAILABLE_SERVICES = [
  'غسيل',
  'كوي',
  'غسيل وكوي',
  'دراي كلين',
  'خياطة / تفصيل',
  'رفي',
  'تلميع',
];

function App() {
  const [view, setView] = useState('pos');
  const [loading, setLoading] = useState(false);

  // --- البيانات ---
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [fin, setFin] = useState({
    cash: 0,
    visa: 0,
    cliq: 0,
    total: 0,
    exp: 0,
    debt: 0,
  });
  const [currentShiftData, setCurrentShiftData] = useState({
    cash: 0,
    visa: 0,
    cliq: 0,
    exp: 0,
  });
  const [cashFloat, setCashFloat] = useState('0');

  // --- POS States ---
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

  // --- ميديا وبحث ---
  const [searchInvNum, setSearchInvNum] = useState('');
  const [searchInvDate, setSearchInvDate] = useState('');
  const [deliveryModal, setDeliveryModal] = useState<any>(null);
  const [shiftModal, setShiftModal] = useState(false);
  const [customerStatement, setCustomerStatement] = useState<any>(null);
  const [showInvDetail, setShowInvDetail] = useState<any>(null);

  // --- إعدادات ---
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expImage, setExpImage] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatPrice, setNewCatPrice] = useState('');
  const [newCrmName, setNewCrmName] = useState('');
  const [newCrmPhone, setNewCrmPhone] = useState('');

  useEffect(() => {
    onSnapshot(collection(db, 'products'), (snap) =>
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    onSnapshot(collection(db, 'customers'), (snap) =>
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    fetchFinancials();
  }, []);

  const fetchFinancials = async () => {
    const s_inv = await getDocs(collection(db, 'invoices'));
    const s_exp = await getDocs(collection(db, 'expenses'));
    const s_shifts = await getDocs(
      query(collection(db, 'shifts'), orderBy('closedAt', 'desc'))
    );
    const lastShift = s_shifts.docs[0]?.data();
    const lastCloseTime = lastShift?.closedAt.toDate() || new Date(0);
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
          if (method === 'Cash') {
            stats.cash += amt;
            if (isNew) shiftStats.cash += amt;
          }
          if (method === 'Visa') {
            stats.visa += amt;
            if (isNew) shiftStats.visa += amt;
          }
          if (method === 'CliQ') {
            stats.cliq += amt;
            if (isNew) shiftStats.cliq += amt;
          }
        };

        updateStats(i.paymentMethod, paid);
        if (i.deliveryPayMethod) updateStats(i.deliveryPayMethod, rem);
        if (i.orderStatus !== 'تم الاستلام' || i.deliveryPayMethod === 'Debt')
          stats.debt += i.remainingAmount;
      }
    });

    s_exp.docs.forEach((d) => {
      stats.exp += d.data().amount;
      if (d.data().createdAt.toDate() > lastCloseTime)
        shiftStats.exp += d.data().amount;
    });

    stats.total = stats.cash + stats.visa + stats.cliq;
    setCurrentShiftData(shiftStats);
    setFin(stats);
    setExpensesList(
      s_exp.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        dateStr: d.data().createdAt?.toDate().toLocaleString('ar-EG'),
      }))
    );
  };

  const handleSaveInvoice = async () => {
    const total = cart.reduce((a, b) => a + b.total, 0);
    let paid =
      paymentStatus === 'مدفوع'
        ? total
        : paymentStatus === 'جزئي'
        ? Number(amountPaid)
        : 0;
    if (paymentStatus === 'غير مدفوع') paid = 0;
    try {
      const invData = {
        invoiceNumber: (invoicesList.length + 1).toString(),
        clientName: invoiceClientName,
        clientPhone: invoiceClientPhone,
        deliveryDate,
        items: cart,
        totalAmount: total,
        amountPaidAtStart: paid,
        remainingAmount: total - paid,
        paymentMethod,
        orderStatus: 'تحت التجهيز',
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'invoices'), invData);
      setLastInvoice({
        ...invData,
        dateStr: new Date().toLocaleString('ar-EG'),
        delDateStr: new Date(deliveryDate).toLocaleString('ar-EG'),
      });
      setCart([]);
      setInvoiceClientName('');
      setInvoiceClientPhone('');
      setTimeout(() => {
        window.print();
        fetchFinancials();
      }, 800);
    } catch (e) {
      alert('خطأ!');
    }
  };

  const navBtn = (v: string, label: string, emoji: string) => (
    <button
      onClick={() => setView(v)}
      className={`nav-item ${view === v ? 'active' : ''}`}
    >
      <span>{emoji}</span> {label}
    </button>
  );

  return (
    <div className="app-container">
      <style>{`
        .app-container { background: #f8fafc; min-height: 100vh; padding: 20px; direction: rtl; font-family: 'Segoe UI', Tahoma; }
        @media print { .no-print { display: none !important; } #print-area { display: block !important; width: 80mm; } .receipt-sep { page-break-after: always; border-bottom: 2px dashed #000; margin-bottom: 30px; padding-bottom: 20px; } }
        .card { background: #fff; padding: 25px; border-radius: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #f1f5f9; }
        .nav-item { padding: 12px 18px; background: #fff; color: #4b5563; border: 1px solid #e2e8f0; border-radius: 15px; cursor: pointer; fontWeight: bold; display: flex; align-items: center; gap: 8px; transition: 0.3s; }
        .nav-item.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        input, select { width: 100%; padding: 14px; margin-bottom: 12px; border-radius: 12px; border: 1px solid #cbd5e1; box-sizing: border-box; font-size: 16px; }
        .btn-main { background: #4f46e5; color: white; border: none; padding: 16px; border-radius: 14px; font-weight: bold; width: 100%; cursor: pointer; font-size: 16px; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2000; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      `}</style>

      {/* --- المودالات --- */}
      {shiftModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{ width: '380px', textAlign: 'center' }}>
            <h3 style={{ color: '#4f46e5' }}>🕒 تسليم الشفت</h3>
            <div
              style={{
                textAlign: 'right',
                lineHeight: '2.5',
                background: '#f8fafc',
                padding: '15px',
                borderRadius: '15px',
              }}
            >
              <p>
                💰 الكاش في الجارور:{' '}
                <strong>
                  {(currentShiftData.cash - currentShiftData.exp).toFixed(2)}{' '}
                  د.أ
                </strong>
              </p>
              <p>
                💳 فيزا: {currentShiftData.visa.toFixed(2)} | 📱 CliQ:{' '}
                {currentShiftData.cliq.toFixed(2)}
              </p>
              <hr />
              <label>💵 مبلغ الأرضية (فكة تبقى بالصندوق):</label>
              <input
                type="number"
                value={cashFloat}
                onChange={(e) => setCashFloat(e.target.value)}
              />
              <p style={{ color: '#4f46e5', fontSize: '18px' }}>
                الصافي للتسليم يدوياً:{' '}
                <b>
                  {(
                    currentShiftData.cash -
                    currentShiftData.exp -
                    Number(cashFloat)
                  ).toFixed(2)}{' '}
                  د.أ
                </b>
              </p>
            </div>
            <button
              className="btn-main"
              style={{ marginTop: '15px' }}
              onClick={async () => {
                await addDoc(collection(db, 'shifts'), {
                  ...currentShiftData,
                  nextFloat: cashFloat,
                  closedAt: Timestamp.now(),
                });
                setShiftModal(false);
                fetchFinancials();
              }}
            >
              تأكيد وتسليم الشفت ✅
            </button>
            <button
              onClick={() => setShiftModal(false)}
              style={{ marginTop: '10px', background: 'none', border: 'none' }}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {deliveryModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{ width: '320px', textAlign: 'center' }}>
            <h3>💰 تحصيل وتسليم</h3>
            <p>
              الباقي المطلوب:{' '}
              <strong>{deliveryModal.remainingAmount} د.أ</strong>
            </p>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'invoices', deliveryModal.id), {
                    orderStatus: 'تم الاستلام',
                    remainingAmount: 0,
                    deliveryPayMethod: 'Cash',
                  });
                  setDeliveryModal(null);
                  fetchFinancials();
                }}
                style={{
                  padding: '12px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                }}
              >
                كاش 💵
              </button>
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'invoices', deliveryModal.id), {
                    orderStatus: 'تم الاستلام',
                    remainingAmount: 0,
                    deliveryPayMethod: 'Visa',
                  });
                  setDeliveryModal(null);
                  fetchFinancials();
                }}
                style={{
                  padding: '12px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                }}
              >
                فيزا 💳
              </button>
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'invoices', deliveryModal.id), {
                    orderStatus: 'تم الاستلام',
                    remainingAmount: 0,
                    deliveryPayMethod: 'CliQ',
                  });
                  setDeliveryModal(null);
                  fetchFinancials();
                }}
                style={{
                  padding: '12px',
                  background: '#9b59b6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                }}
              >
                CliQ 📱
              </button>
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'invoices', deliveryModal.id), {
                    orderStatus: 'تم الاستلام',
                    deliveryPayMethod: 'Debt',
                  });
                  setDeliveryModal(null);
                  fetchFinancials();
                }}
                style={{
                  padding: '12px',
                  background: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                }}
              >
                ذمة 📝
              </button>
            </div>
          </div>
        </div>
      )}

      {customerStatement && (
        <div className="modal-overlay no-print">
          <div className="card" style={{ width: '90%', maxWidth: '600px' }}>
            <h3>📄 سجل حساب: {customerStatement.name}</h3>
            <table
              style={{ width: '100%', textAlign: 'right', fontSize: '13px' }}
            >
              <tr style={{ background: '#f1f5f9' }}>
                <th>رقم</th>
                <th>المبلغ</th>
                <th>المتبقي</th>
                <th>الحالة</th>
              </tr>
              {invoicesList
                .filter((i) => i.clientPhone === customerStatement.phone)
                .map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td>#{inv.invoiceNumber}</td>
                    <td>{inv.totalAmount}</td>
                    <td style={{ color: 'red' }}>{inv.remainingAmount}</td>
                    <td>{inv.orderStatus}</td>
                  </tr>
                ))}
            </table>
            <button
              className="btn-main"
              style={{ marginTop: '15px' }}
              onClick={() => setCustomerStatement(null)}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* --- شريط التنقل --- */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'center',
          marginBottom: '30px',
          flexWrap: 'wrap',
        }}
      >
        {navBtn('pos', 'استقبال', '🧺')}
        {navBtn('tracking', 'متابعة', '🚚')}
        {navBtn('archive', 'أرشيف', '📑')}
        <button onClick={() => setShiftModal(true)} className="nav-item">
          <span>🕒</span> شفت
        </button>
        {navBtn('float', 'الأرضية', '💰')}
        {navBtn('crm', 'عملاء', '👥')}
        {navBtn('expenses', 'مصاريف', '💸')}
        {navBtn('reports', 'ميزانية', '📊')}
        {navBtn('settings', 'إعدادات', '⚙️')}
      </div>

      {/* --- واجهة الاستقبال POS --- */}
      {view === 'pos' && (
        <div
          className="no-print"
          style={{ maxWidth: '600px', margin: '0 auto' }}
        >
          <div className="card">
            <h3>🧾 فاتورة جديدة</h3>
            <input
              type="text"
              placeholder="اسم الزبون"
              value={invoiceClientName}
              onChange={(e) => setInvoiceClientName(e.target.value)}
            />
            <input
              type="tel"
              placeholder="رقم الهاتف"
              value={invoiceClientPhone}
              onChange={(e) => setInvoiceClientPhone(e.target.value)}
            />
            <input
              type="datetime-local"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
            <div className="grid-2">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Cash">كاش 💵</option>
                <option value="Visa">فيزا 💳</option>
                <option value="CliQ">كليك 📱</option>
              </select>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                <option value="مدفوع">مدفوع كامل</option>
                <option value="جزئي">عربون</option>
                <option value="غير مدفوع">ذمة</option>
              </select>
            </div>
            {paymentStatus === 'جزئي' && (
              <input
                type="number"
                placeholder="المبلغ المقبوض"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#fff4e5',
                padding: '15px',
                borderRadius: '15px',
                marginBottom: '15px',
                border: '1px solid #ffe2b3',
              }}
            >
              <input
                type="checkbox"
                checked={hasStains}
                onChange={(e) => setHasStains(e.target.checked)}
                style={{ width: '25px', height: '25px', margin: 0 }}
              />
              <label style={{ fontWeight: 'bold', color: '#856404' }}>
                ⚠️ إزالة بقع متعبة (Tick)
              </label>
            </div>
            <input
              type="text"
              placeholder="ملاحظات الخياطة / الخدمة المطلوبة..."
              value={tailoringNotes}
              onChange={(e) => setTailoringNotes(e.target.value)}
            />

            <div
              className="grid-2"
              style={{ gridTemplateColumns: '2fr 1fr 1fr' }}
            >
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  const p = products.find((x) => x.name === e.target.value);
                  setPricePerUnit(
                    e.target.value === 'سجاد' ? '1.25' : p?.defaultPrice || ''
                  );
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="العدد"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <input
                type="number"
                placeholder="سعر"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
              />
            </div>
            <button
              className="btn-main"
              onClick={() => {
                if (qty) {
                  setCart([
                    ...cart,
                    {
                      id: Date.now(),
                      category,
                      qty: Number(qty),
                      price: Number(pricePerUnit),
                      total: Number(qty) * Number(pricePerUnit),
                      hasStains,
                      notes: tailoringNotes,
                    },
                  ]);
                  setQty('');
                  setTailoringNotes('');
                  setHasStains(false);
                }
              }}
            >
              إضافة للطلب +
            </button>
          </div>
          {cart.length > 0 && (
            <div className="card">
              {cart.map((item, idx) => (
                <div
                  key={idx}
                  style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}
                >
                  <strong>{item.category}</strong> x{item.qty} ={' '}
                  {item.total.toFixed(2)} د.أ {item.hasStains && ' [⚠️ بقع]'}
                </div>
              ))}
              <h2 style={{ color: '#10b981', textAlign: 'center' }}>
                الإجمالي: {cart.reduce((a, b) => a + b.total, 0).toFixed(2)} د.أ
              </h2>
              <button
                className="btn-main"
                style={{ background: '#10b981' }}
                onClick={handleSaveInvoice}
              >
                ✅ حفظ وطباعة الفاتورة
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- المتابعة مع زر الواتساب المطور --- */}
      {view === 'tracking' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {invoicesList
            .filter(
              (i) =>
                i.orderStatus === 'تحت التجهيز' ||
                i.orderStatus === 'تم التجهيز'
            )
            .map((inv) => (
              <div
                key={inv.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderRight:
                    inv.orderStatus === 'تم التجهيز'
                      ? '12px solid #10b981'
                      : '12px solid #f59e0b',
                }}
              >
                <div>
                  <strong>
                    {inv.clientName} (#{inv.invoiceNumber})
                  </strong>
                  <br />
                  <small>المتبقي: {inv.remainingAmount} د.أ</small>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    style={{ width: '110px', margin: 0 }}
                    value={inv.orderStatus}
                    onChange={(e) =>
                      updateDoc(doc(db, 'invoices', inv.id), {
                        orderStatus: e.target.value,
                      }).then(fetchFinancials)
                    }
                  >
                    <option value="تحت التجهيز">قيد العمل</option>
                    <option value="تم التجهيز">جاهز</option>
                  </select>
                  {inv.orderStatus === 'تم التجهيز' && (
                    <button
                      onClick={() => {
                        const p = inv.clientPhone.startsWith('0')
                          ? '962' + inv.clientPhone.substring(1)
                          : inv.clientPhone;
                        const msg = `زبوننا العزيز ${inv.clientName}، طلبك رقم (${inv.invoiceNumber}) جاهز الآن. الحساب المطلوب: ${inv.remainingAmount} د.أ. أهلاً بك.`;
                        window.open(
                          `https://wa.me/${p}?text=${encodeURIComponent(msg)}`,
                          '_blank'
                        );
                      }}
                      style={{
                        background: '#25D366',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px',
                      }}
                    >
                      واتساب 📱
                    </button>
                  )}
                  <button
                    onClick={() => setDeliveryModal(inv)}
                    style={{
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px 20px',
                    }}
                  >
                    تسليم
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* --- الأرشيف مع البحث والإلغاء --- */}
      {view === 'archive' && (
        <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="grid-2" style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="بحث برقم الفاتورة..."
              value={searchInvNum}
              onChange={(e) => setSearchInvNum(e.target.value)}
            />
            <input
              type="date"
              value={searchInvDate}
              onChange={(e) => setSearchInvDate(e.target.value)}
            />
          </div>
          <table
            style={{
              width: '100%',
              textAlign: 'right',
              fontSize: '14px',
              borderCollapse: 'collapse',
            }}
          >
            <tr style={{ background: '#f8fafc' }}>
              <th>#</th>
              <th>الزبون</th>
              <th>التاريخ</th>
              <th>المجموع</th>
              <th>الحالة</th>
              <th>عرض</th>
              <th>إلغاء</th>
            </tr>
            {invoicesList
              .filter(
                (i) =>
                  (searchInvNum === '' ||
                    i.invoiceNumber.includes(searchInvNum)) &&
                  (searchInvDate === '' || i.fullDate === searchInvDate)
              )
              .map((i) => (
                <tr
                  key={i.id}
                  style={{
                    borderBottom: '1px solid #eee',
                    color: i.orderStatus === 'ملغية' ? '#ccc' : '#000',
                  }}
                >
                  <td>{i.invoiceNumber}</td>
                  <td>{i.clientName}</td>
                  <td>{i.dateStr}</td>
                  <td>{i.totalAmount}</td>
                  <td>{i.orderStatus}</td>
                  <td>
                    <button onClick={() => setShowInvDetail(i)}>👁️</button>
                  </td>
                  <td>
                    <button
                      onClick={async () => {
                        if (window.confirm('هل تريد إلغاء الفاتورة؟')) {
                          await updateDoc(doc(db, 'invoices', i.id), {
                            orderStatus: 'ملغية',
                            amountPaidAtStart: 0,
                            remainingAmount: 0,
                          });
                          fetchFinancials();
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
          </table>
        </div>
      )}

      {/* --- العملاء CRM --- */}
      {view === 'crm' && (
        <div style={{ maxWidth: '650px', margin: '0 auto' }}>
          <div className="card">
            <h3>👥 إضافة زبون جديد</h3>
            <input
              type="text"
              placeholder="الاسم الكامل"
              value={newCrmName}
              onChange={(e) => setNewCrmName(e.target.value)}
            />
            <input
              type="tel"
              placeholder="رقم الهاتف"
              value={newCrmPhone}
              onChange={(e) => setNewCrmPhone(e.target.value)}
            />
            <button
              className="btn-main"
              style={{ background: '#10b981' }}
              onClick={async () => {
                if (newCrmName) {
                  await addDoc(collection(db, 'customers'), {
                    name: newCrmName,
                    phone: newCrmPhone,
                    createdAt: Timestamp.now(),
                  });
                  setNewCrmName('');
                  fetchFinancials();
                  alert('تم الحفظ');
                }
              }}
            >
              حفظ الزبون
            </button>
          </div>
          {customers.map((c) => {
            const d = invoicesList
              .filter((i) => i.clientPhone === c.phone)
              .reduce(
                (acc, curr) =>
                  acc +
                  (curr.orderStatus !== 'ملغية' ? curr.remainingAmount : 0),
                0
              );
            return (
              <div
                key={c.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{c.name}</strong>
                  <br />
                  {c.phone}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      color: d > 0 ? 'red' : 'green',
                      fontWeight: 'bold',
                    }}
                  >
                    الذمة: {d.toFixed(2)} د.أ
                  </div>
                  <button
                    onClick={() => setCustomerStatement(c)}
                    style={{
                      marginTop: '5px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #4f46e5',
                      color: '#4f46e5',
                      background: '#fff',
                    }}
                  >
                    كشف حساب
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- المصاريف مع الصور --- */}
      {view === 'expenses' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="card">
            <h3>💸 تسجيل مصروف</h3>
            <input
              type="text"
              placeholder="البيان"
              value={expName}
              onChange={(e) => setExpName(e.target.value)}
            />
            <input
              type="number"
              placeholder="المبلغ"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
            />
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) {
                  const r = new FileReader();
                  r.onloadend = () => setExpImage(r.result as string);
                  r.readAsDataURL(f);
                }
              }}
            />
            <button
              className="btn-main"
              style={{ background: '#ef4444' }}
              onClick={async () => {
                if (expName && expAmount) {
                  await addDoc(collection(db, 'expenses'), {
                    title: expName,
                    amount: Number(expAmount),
                    image: expImage,
                    createdAt: Timestamp.now(),
                  });
                  fetchFinancials();
                  setExpName('');
                  setExpAmount('');
                  setExpImage(null);
                }
              }}
            >
              حفظ المصروف
            </button>
          </div>
          {expensesList.map((ex) => (
            <div
              key={ex.id}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between' }}
            >
              <span>
                {ex.title} ({ex.amount} د.أ)
              </span>
              {ex.image && (
                <a href={ex.image} target="_blank">
                  🖼️ عرض الفاتورة
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* --- الأرضية --- */}
      {view === 'float' && (
        <div
          className="card"
          style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}
        >
          <h2 style={{ fontSize: '40px', color: '#4f46e5' }}>
            {Number(cashFloat).toFixed(2)} د.أ
          </h2>
          <p>أرضية الكاش (الفكة) الحالية في الصندوق</p>
          <hr />
          <input
            type="number"
            placeholder="تحديث الأرضية يدوياً"
            onBlur={async (e) => {
              if (e.target.value) {
                setCashFloat(e.target.value);
                await addDoc(collection(db, 'shifts'), {
                  cash: 0,
                  visa: 0,
                  cliq: 0,
                  exp: 0,
                  nextFloat: e.target.value,
                  closedAt: Timestamp.now(),
                });
                fetchFinancials();
              }
            }}
          />
        </div>
      )}

      {/* --- الميزانية العامة --- */}
      {view === 'reports' && (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="grid-2">
            <div
              className="card"
              style={{ background: '#4f46e5', color: '#fff' }}
            >
              💰 الإيراد الكلي <br /> <h2>{fin.total.toFixed(2)}</h2>
            </div>
            <div
              className="card"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              💸 المصاريف <br /> <h2>{fin.exp.toFixed(2)}</h2>
            </div>
            <div
              className="card"
              style={{ background: '#f59e0b', color: '#fff' }}
            >
              📝 ديون خارجة <br /> <h2>{fin.debt.toFixed(2)}</h2>
            </div>
            <div
              className="card"
              style={{ background: '#10b981', color: '#fff' }}
            >
              💹 صافي الربح <br /> <h2>{(fin.total - fin.exp).toFixed(2)}</h2>
            </div>
          </div>
        </div>
      )}

      {/* --- الإعدادات --- */}
      {view === 'settings' && (
        <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h3>⚙️ الأصناف والأسعار</h3>
          <input
            type="text"
            placeholder="اسم الصنف"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <input
            type="number"
            placeholder="سعر افتراضي"
            value={newCatPrice}
            onChange={(e) => setNewCatPrice(e.target.value)}
          />
          <button
            className="btn-main"
            onClick={async () => {
              if (newCatName) {
                await addDoc(collection(db, 'products'), {
                  name: newCatName,
                  defaultPrice: newCatPrice,
                });
                setNewCatName('');
                fetchFinancials();
              }
            }}
          >
            إضافة صنف
          </button>
          <hr style={{ margin: '15px 0' }} />
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              {p.name} ({p.defaultPrice} د.أ){' '}
              <button
                onClick={() => deleteDoc(doc(db, 'products', p.id))}
                style={{ color: 'red', border: 'none', background: 'none' }}
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      )}

      {/* --- منطقة الطباعة المزدوجة --- */}
      <div id="print-area" style={{ display: 'none' }}>
        {lastInvoice && (
          <>
            <div className="receipt-sep">
              <ReceiptTemplate inv={lastInvoice} title="نسخة العميل" />
            </div>
            <ReceiptTemplate inv={lastInvoice} title="نسخة المحل" />
          </>
        )}
      </div>
    </div>
  );
}

const ReceiptTemplate = ({ inv, title }: any) => (
  <div
    style={{
      width: '80mm',
      padding: '5mm',
      textAlign: 'center',
      fontFamily: 'Arial',
    }}
  >
    <h2 style={{ margin: '0' }}>{SHOP_NAME}</h2>
    <p style={{ margin: '2px 0', fontSize: '13px' }}>{SHOP_PHONE}</p>
    <div style={{ borderTop: '1px solid #000', margin: '8px 0' }}></div>
    <h3 style={{ background: '#eee', padding: '5px', fontSize: '15px' }}>
      {title} - #{inv.invoiceNumber}
    </h3>
    <div style={{ textAlign: 'right', fontSize: '12px', lineHeight: '1.6' }}>
      <p style={{ margin: 0 }}>
        <b>الزبون:</b> {inv.clientName}
      </p>
      <p style={{ margin: 0 }}>
        <b>التاريخ:</b> {inv.dateStr}
      </p>
      <p style={{ margin: 0, color: 'red' }}>
        <b>التسليم:</b> {inv.delDateStr}
      </p>
    </div>
    <table
      style={{
        width: '100%',
        fontSize: '11px',
        borderCollapse: 'collapse',
        marginTop: '12px',
      }}
    >
      <thead>
        <tr style={{ borderBottom: '1px solid #000' }}>
          <th align="right">الصنف</th>
          <th>العدد</th>
          <th>المجموع</th>
        </tr>
      </thead>
      <tbody>
        {inv.items?.map((it: any, idx: number) => (
          <tr key={idx} style={{ borderBottom: '0.5px solid #eee' }}>
            <td style={{ padding: '6px 0' }}>
              {it.category}
              {it.hasStains && (
                <div style={{ fontWeight: 'bold' }}>* إزالة بقع متعبة</div>
              )}
              {it.notes && (
                <div style={{ fontSize: '10px', fontStyle: 'italic' }}>
                  * {it.notes}
                </div>
              )}
            </td>
            <td align="center">{it.qty}</td>
            <td align="center">{it.total.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div
      style={{
        textAlign: 'left',
        borderTop: '1px solid #000',
        marginTop: '10px',
        paddingTop: '8px',
      }}
    >
      <p style={{ margin: 0 }}>الإجمالي: {inv.totalAmount.toFixed(2)} د.أ</p>
      <p style={{ margin: 0 }}>
        المدفوع: {inv.amountPaidAtStart.toFixed(2)} د.أ
      </p>
      <h3 style={{ margin: 0, fontSize: '18px' }}>
        المتبقي: {inv.remainingAmount.toFixed(2)} د.أ
      </h3>
    </div>
    <p style={{ fontSize: '10px', marginTop: '15px' }}>{SHOP_ADDR}</p>
  </div>
);

export default App;
