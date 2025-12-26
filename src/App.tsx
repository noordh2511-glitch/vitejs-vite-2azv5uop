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

// --- ثوابت النظام ---
const SHOP_NAME = 'بيت الغسيل والكوي';
const SHOP_PHONE = '0791112838';
const SHOP_ADDR = 'ناعور - مجمع سعود التجاري';

function App() {
  // --- إدارة الحالة (States) ---
  const [view, setView] = useState<string>('pos');
  const [shiftsArchive, setShiftsArchive] = useState<any[]>([]);
  const [currentShiftInfo, setCurrentShiftInfo] = useState({ type: 'صباحي', employee: '' });
  
  // البيانات الأساسية
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  
  // المالية (الإجمالية)
  const [fin, setFin] = useState({ cash: 0, visa: 0, cliq: 0, total: 0, exp: 0, debt: 0 });
  const [currentShiftData, setCurrentShiftData] = useState({ cash: 0, visa: 0, cliq: 0, exp: 0 });
  const [cashFloat, setCashFloat] = useState('0');

  // 📊 فلاتر التقارير المتقدمة
  const [reportType, setReportType] = useState('daily'); // daily, monthly, year
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]); 
  const [filteredStats, setFilteredStats] = useState({ cash: 0, visa: 0, cliq: 0, total: 0, exp: 0, debt: 0 });

  // POS Inputs (مدخلات نقطة البيع)
  const [invoiceClientName, setInvoiceClientName] = useState('');
  const [invoiceClientPhone, setInvoiceClientPhone] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('مدفوع');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [manualPriceMode, setManualPriceMode] = useState(false); 
  const [lastInvoice, setLastInvoice] = useState<any>(null); 

  // مدخلات الخياطة 🪡
  const [tailoringDetails, setTailoringDetails] = useState('');
  const [tailoringPrice, setTailoringPrice] = useState('');
  const [tailoringQty, setTailoringQty] = useState('1');

  // البحث والأرشيف
  const [searchTerm, setSearchTerm] = useState('');
  const [archiveDate, setArchiveDate] = useState(''); 

  // نماذج الإدخال (Forms)
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('مواد تنظيف');
  
  const [newCrmName, setNewCrmName] = useState('');
  const [newCrmPhone, setNewCrmPhone] = useState('');
  
  // إعدادات المنتجات
  const [newCatName, setNewCatName] = useState('');
  const [newCatPrice, setNewCatPrice] = useState('');
  const [newCatService, setNewCatService] = useState('غسيل وكوي');

  // النوافذ المنبثقة (Modals)
  const [deliveryModal, setDeliveryModal] = useState<any>(null);
  const [shiftModal, setShiftModal] = useState(false);
  const [showShiftArchiveModal, setShowShiftArchiveModal] = useState(false);
  const [viewInvoiceModal, setViewInvoiceModal] = useState<any>(null);
  const [tailoringModal, setTailoringModal] = useState(false);

  // --- Effects (التأثيرات) ---
  
  useEffect(() => {
    const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubC = onSnapshot(collection(db, 'customers'), s => setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubS = onSnapshot(query(collection(db, "shifts_archive"), orderBy("timestamp", "desc")), s => setShiftsArchive(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    fetchFinancials();
    const interval = setInterval(fetchFinancials, 30000); 

    return () => { unsubP(); unsubC(); unsubS(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    calculateReportStats();
  }, [reportType, reportDate, invoicesList, expensesList]);

  const playAlertSound = () => {
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    // FIX: Removed unused 'e' parameter
    audio.play().catch(() => console.log("Audio interaction needed"));
  };

  useEffect(() => {
    const checkOverdue = () => {
      const now = new Date();
      const hasOverdue = invoicesList.some(i => 
        i.orderStatus === 'تحت التجهيز' && new Date(i.deliveryDate) < now
      );
      if (hasOverdue) playAlertSound();
    };
    if (invoicesList.length > 0) checkOverdue();
    const timer = setInterval(checkOverdue, 60000);
    return () => clearInterval(timer);
  }, [invoicesList]);

  // --- Functions (الدوال) ---

  const fetchFinancials = async () => {
    const s_inv = await getDocs(collection(db, 'invoices'));
    const s_exp = await getDocs(collection(db, 'expenses'));
    const s_shifts = await getDocs(query(collection(db, 'shifts_archive'), orderBy('timestamp', 'desc')));
    
    const lastShift = s_shifts.docs[0]?.data();
    const lastCloseTime = lastShift?.timestamp?.toDate() || new Date(0);
    if (lastShift) setCashFloat(lastShift.nextFloat || '0');

    let stats = { cash: 0, visa: 0, cliq: 0, total: 0, exp: 0, debt: 0 };
    let shiftStats = { cash: 0, visa: 0, cliq: 0, exp: 0 };

    const invs = s_inv.docs.map(d => ({ 
      id: d.id, ...d.data(), 
      dateStr: d.data().createdAt?.toDate().toLocaleString('ar-EG'), 
      fullDate: d.data().createdAt?.toDate().toISOString().split('T')[0],
      monthStr: d.data().createdAt?.toDate().toISOString().slice(0, 7),
      yearStr: d.data().createdAt?.toDate().toISOString().slice(0, 4)
    }));
    
    invs.sort((a: any, b: any) => b.createdAt - a.createdAt);
    setInvoicesList(invs);

    s_inv.docs.forEach(d => {
      const i = d.data();
      if (i.orderStatus !== 'ملغية') {
        const paid = i.amountPaidAtStart || 0;
        const rem = i.totalAmount - paid;
        const isNew = i.createdAt.toDate() > lastCloseTime;

        const add = (m: string, a: number) => {
          if (m === 'Cash') { stats.cash += a; if (isNew) shiftStats.cash += a; }
          if (m === 'Visa') { stats.visa += a; if (isNew) shiftStats.visa += a; }
          if (m === 'CliQ') { stats.cliq += a; if (isNew) shiftStats.cliq += a; }
        };

        add(i.paymentMethod, paid);
        if (i.deliveryPayMethod) add(i.deliveryPayMethod, rem);
        if (i.orderStatus !== 'تم الاستلام' || i.deliveryPayMethod === 'Debt') stats.debt += i.remainingAmount;
      }
    });

    s_exp.docs.forEach(d => {
      stats.exp += Number(d.data().amount);
      if (d.data().createdAt.toDate() > lastCloseTime) shiftStats.exp += Number(d.data().amount);
    });

    stats.total = stats.cash + stats.visa + stats.cliq;
    setCurrentShiftData(shiftStats); 
    setFin(stats);
    setExpensesList(s_exp.docs.map(d => ({ 
      id: d.id, ...d.data(), 
      dateStr: d.data().createdAt?.toDate().toLocaleString('ar-EG'),
      fullDate: d.data().createdAt?.toDate().toISOString().split('T')[0],
      monthStr: d.data().createdAt?.toDate().toISOString().slice(0, 7),
      yearStr: d.data().createdAt?.toDate().toISOString().slice(0, 4)
    })).reverse());
  };

  const calculateReportStats = () => {
    let tempStats = { cash: 0, visa: 0, cliq: 0, total: 0, exp: 0, debt: 0 };
    
    const relevantInvoices = invoicesList.filter(inv => {
      if (reportType === 'daily') return inv.fullDate === reportDate;
      if (reportType === 'monthly') return inv.monthStr === reportDate.slice(0, 7);
      if (reportType === 'year') return inv.yearStr === reportDate.slice(0, 4);
      return false;
    });

    const relevantExpenses = expensesList.filter(exp => {
      if (reportType === 'daily') return exp.fullDate === reportDate;
      if (reportType === 'monthly') return exp.monthStr === reportDate.slice(0, 7);
      if (reportType === 'year') return exp.yearStr === reportDate.slice(0, 4);
      return false;
    });

    relevantInvoices.forEach(i => {
      if (i.orderStatus !== 'ملغية') {
        const paid = i.amountPaidAtStart || 0;
        const rem = i.totalAmount - paid;
        
        const add = (m: string, a: number) => {
          if (m === 'Cash') tempStats.cash += a;
          if (m === 'Visa') tempStats.visa += a;
          if (m === 'CliQ') tempStats.cliq += a;
        };
        
        add(i.paymentMethod, paid);
        if (i.deliveryPayMethod) add(i.deliveryPayMethod, rem);
        if (i.orderStatus !== 'تم الاستلام' || i.deliveryPayMethod === 'Debt') tempStats.debt += i.remainingAmount;
      }
    });

    relevantExpenses.forEach(e => tempStats.exp += Number(e.amount));
    tempStats.total = tempStats.cash + tempStats.visa + tempStats.cliq;
    setFilteredStats(tempStats);
  };

  const handleSaveInvoice = async () => {
    if (!invoiceClientName || cart.length === 0) return alert("الرجاء إدخال اسم العميل واختيار أصناف");
    
    const total = cart.reduce((a, b) => a + b.total, 0);
    let paid = paymentStatus === 'مدفوع' ? total : paymentStatus === 'جزئي' ? Number(prompt("المبلغ المدفوع كعربون:", "0")) : 0;
    
    const invData = { 
      invoiceNumber: (invoicesList.length + 1).toString(), 
      clientName: invoiceClientName, 
      clientPhone: invoiceClientPhone, 
      deliveryDate: deliveryDate || new Date(Date.now() + 24*60*60*1000).toISOString(),
      items: cart, 
      totalAmount: total, 
      amountPaidAtStart: paid, 
      remainingAmount: total - paid, 
      paymentMethod, 
      orderStatus: 'تحت التجهيز', 
      createdAt: Timestamp.now() 
    };

    await addDoc(collection(db, 'invoices'), invData);
    setLastInvoice({ ...invData, dateStr: new Date().toLocaleString('ar-EG') });
    
    setCart([]); setInvoiceClientName(''); setInvoiceClientPhone(''); setPaymentStatus('مدفوع');
    setTimeout(() => { window.print(); fetchFinancials(); }, 800);
  };

  const handleAddTailoring = () => {
    if(!tailoringDetails || !tailoringPrice) return alert("الرجاء إدخال التفاصيل والسعر");
    
    const price = Number(tailoringPrice);
    const qty = Number(tailoringQty) || 1;

    setCart([...cart, {
      id: Date.now(),
      category: "خياطة",
      itemNote: `(${tailoringDetails})`,
      price: price,
      qty: qty,
      total: price * qty,
      serviceType: 'خياطة',
      hasStains: false,
      isUrgent: false
    }]);

    setTailoringModal(false);
    setTailoringDetails(''); setTailoringPrice(''); setTailoringQty('1');
  };

  const handleAddToCart = (p: any) => {
    let finalPrice = Number(p.defaultPrice);
    let qty = 1;
    let isUrgentItem = false;
    let itemNote = "";

    if (p.name.includes("سجاد")) {
       const meters = prompt("كم عدد الأمتار للسجاد؟");
       if (!meters) return;
       qty = Number(meters);
       finalPrice = 1.25; 
       itemNote = `(${qty} متر)`;
    } 
    else if (manualPriceMode) {
      const userPrice = prompt(`أدخل السعر الجديد لـ (${p.name}):`, p.defaultPrice);
      if (userPrice === null) return;
      finalPrice = Number(userPrice);
      if(finalPrice > Number(p.defaultPrice)) isUrgentItem = true;
    }

    const totalItemPrice = finalPrice * qty;

    const exist = cart.find(c => c.category === p.name && c.price === finalPrice && c.serviceType === p.serviceType && !c.hasStains && !c.itemNote);
    
    if (exist) {
        setCart(cart.map(c => c.id === exist.id ? {...c, qty: c.qty + qty, total: (c.qty + qty) * c.price} : c));
    } else {
        setCart([...cart, { 
          id: Date.now(), 
          category: p.name, 
          qty: qty, 
          price: finalPrice, 
          total: totalItemPrice, 
          hasStains: false, 
          isUrgent: isUrgentItem,
          serviceType: p.serviceType || 'غسيل وكوي', 
          itemNote: itemNote
        }]);
    }
  };

  const markAsReady = async (id: string) => {
    if(!window.confirm("هل الطلب جاهز تماماً؟")) return;
    await updateDoc(doc(db, 'invoices', id), { orderStatus: 'تم التجهيز' });
    fetchFinancials();
  };

  const handleReprint = (inv: any) => {
    setLastInvoice(inv);
    setTimeout(() => { window.print(); }, 500);
  };

  const navBtn = (v: string, l: string, e: string) => (
    <button onClick={() => setView(v)} className={`nav-item ${view === v ? 'active' : ''}`}><span>{e}</span> {l}</button>
  );

  return (
    <div className="app-container">
      {/* --- Styles (CSS) --- */}
      <style>{`
        :root { --primary: #4f46e5; --bg: #f3f4f6; --surface: #ffffff; --text: #1f2937; --danger: #ef4444; --success: #10b981; --warning: #f59e0b; }
        .app-container { background: var(--bg); min-height: 100vh; padding: 15px; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; color: var(--text); }
        .nav-bar { display: flex; gap: 10px; padding: 10px; background: var(--surface); border-radius: 16px; margin-bottom: 20px; overflow-x: auto; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .nav-item { border: none; background: transparent; padding: 10px 20px; border-radius: 12px; font-weight: 600; color: #6b7280; cursor: pointer; transition: 0.2s; white-space: nowrap; }
        .nav-item.active { background: var(--primary); color: white; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }
        .card { background: var(--surface); padding: 20px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 15px; border: 1px solid #e5e7eb; position: relative; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
        input, select, textarea { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 10px; border: 1px solid #cbd5e1; box-sizing: border-box; font-family: inherit; }
        .btn-main { background: var(--primary); color: white; border: none; padding: 15px; border-radius: 12px; font-weight: bold; width: 100%; cursor: pointer; }
        .pos-layout { display: grid; grid-template-columns: 2fr 1.2fr; gap: 20px; height: calc(100vh - 100px); }
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; overflow-y: auto; align-content: start; padding-bottom: 50px; }
        .prod-btn { background: var(--surface); border: 1px solid #e5e7eb; padding: 15px 10px; border-radius: 12px; cursor: pointer; min-height: 110px; height: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: 0.2s; }
        .prod-btn:hover { border-color: var(--primary); transform: translateY(-2px); }
        .prod-btn span { font-size: 14px; font-weight: bold; text-align: center; color: #1f2937; line-height: 1.2; }
        .prod-btn small { color: #6b7280; font-size: 13px; font-weight: bold; background: #f3f4f6; padding: 2px 8px; border-radius: 10px; margin-top: 4px; }
        .cart-panel { background: var(--surface); border-radius: 16px; padding: 15px; display: flex; flex-direction: column; height: 100%; }
        .cart-items { flex: 1; overflow-y: auto; border-top: 1px solid #f3f4f6; margin: 10px 0; }
        .cart-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed #e5e7eb; }
        .kanban-board { display: flex; gap: 15px; overflow-x: auto; height: calc(100vh - 160px); align-items: flex-start; }
        .kanban-col { flex: 1; min-width: 300px; background: #e5e7eb; border-radius: 16px; padding: 10px; display: flex; flex-direction: column; max-height: 100%; }
        .k-header { font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; padding: 10px; background: #fff; border-radius: 10px; }
        .k-card { background: #fff; padding: 12px; border-radius: 12px; margin-bottom: 8px; border-left: 5px solid transparent; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .status-delayed { border-left-color: var(--danger); background: #fef2f2; }
        .status-pending { border-left-color: var(--warning); }
        .status-ready { border-left-color: var(--success); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .stat-card { padding: 15px; border-radius: 12px; color: white; text-align: center; font-weight: bold; }
        .close-view-btn { position: absolute; left: 15px; top: 15px; background: #ef4444; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; }
        @media (max-width: 768px) { .pos-layout { grid-template-columns: 1fr; height: auto; } }
        @media print { .no-print { display: none !important; } #print-area { display: block !important; } .receipt-sep { page-break-after: always; border-bottom: 2px dashed #000; margin-bottom: 20px; } }
      `}</style>

      {/* --- Top Navigation --- */}
      <div className="nav-bar no-print">
        {navBtn('pos', 'نقطة بيع', '🧺')}
        {navBtn('tracking', 'متابعة', '🚚')}
        {navBtn('invoices', 'السجل', '📜')}
        {navBtn('reports', 'الميزانية', '📊')}
        {navBtn('crm', 'الزبائن', '👥')}
        {navBtn('expenses', 'المصاريف', '💸')}
        {navBtn('settings', 'إعدادات', '⚙️')}
        <div style={{width: 1, background: '#ddd', margin: '0 5px'}}></div>
        <button onClick={() => setShowShiftArchiveModal(true)} className="nav-item">📂 الأرشيف</button>
        <button onClick={() => setShiftModal(true)} className="nav-item" style={{color: '#ef4444'}}>🕒 إغلاق شفت</button>
      </div>

      {/* ==================== 1. شاشة البيع (POS) ==================== */}
      {view === 'pos' && (
        <div className="pos-layout no-print">
          <div style={{overflowY: 'auto'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 15}}>
              <h3 style={{margin:0}}>📦 الخدمات</h3>
              <div style={{display:'flex', gap:5}}>
                {/* زر الخياطة */}
                <button 
                  onClick={() => setTailoringModal(true)}
                  style={{background: '#8b5cf6', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'}}
                >
                  🪡 خياطة
                </button>
                {/* زر السعر اليدوي */}
                <button 
                  onClick={() => setManualPriceMode(!manualPriceMode)}
                  style={{
                    background: manualPriceMode ? '#ef4444' : '#e5e7eb',
                    color: manualPriceMode ? 'white' : '#374151',
                    border: 'none', padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'
                  }}
                >
                  {manualPriceMode ? '✏️ سعر يدوي' : '🖐️ تفعيل يدوي'}
                </button>
              </div>
            </div>
            <div className="products-grid">
              {products.map(p => (
                <button 
                  key={p.id} 
                  className="prod-btn"
                  style={{borderColor: manualPriceMode ? '#ef4444' : '#e5e7eb', borderWidth: manualPriceMode ? 2 : 1}}
                  onClick={() => handleAddToCart(p)}
                >
                  <div style={{fontSize: 24}}>👕</div>
                  <span>{p.name}</span>
                  <small>{p.serviceType || 'خدمة'}</small>
                  <small style={{background: 'none', fontSize: 11, color: '#4f46e5'}}>{p.defaultPrice} د.أ</small>
                </button>
              ))}
            </div>
          </div>

          <div className="cart-panel">
            <div style={{background:'#f9fafb', padding:10, borderRadius:10, marginBottom:10}}>
              <input list="cust" placeholder="بحث عن زبون..." value={invoiceClientName} onChange={e => { setInvoiceClientName(e.target.value); const c = customers.find(x => x.name === e.target.value); if (c) setInvoiceClientPhone(c.phone); }} />
              <datalist id="cust">{customers.map(c => <option key={c.id} value={c.name} />)}</datalist>
              <div style={{display:'flex', gap:5}}>
                  <input type="tel" placeholder="الهاتف" value={invoiceClientPhone} onChange={e => setInvoiceClientPhone(e.target.value)} style={{flex:1, margin:0}} />
                  <input type="datetime-local" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={{flex:1, margin:0}} />
              </div>
            </div>
            <div className="cart-items">
              {cart.map((it, idx) => (
                <div key={idx} className="cart-item" style={{background: it.isUrgent ? '#fef2f2' : 'transparent'}}>
                  <div>
                    <div style={{fontWeight:'bold'}}>{it.category} {it.itemNote} {it.isUrgent && '🔥'}</div>
                    <div style={{fontSize:11, color:'gray'}}>{it.serviceType} | سعر: {it.price.toFixed(2)}</div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:5}}>
                    <button onClick={() => {
                        const newQty = it.qty - 1;
                        if(newQty > 0) setCart(cart.map(c => c.id === it.id ? {...c, qty: newQty, total: newQty*c.price} : c));
                        else setCart(cart.filter(c => c.id !== it.id));
                      }} style={{background:'#fee2e2', border:'none', width:25, borderRadius:4}}>-</button>
                    <span>{it.qty}</span>
                    <button onClick={() => setCart(cart.map(c => c.id === it.id ? {...c, qty: c.qty + 1, total: (c.qty+1)*c.price} : c))} 
                      style={{background:'#d1fae5', border:'none', width:25, borderRadius:4}}>+</button>
                  </div>
                  <strong>{it.total.toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div style={{borderTop:'2px solid #e5e7eb', paddingTop:10}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:10, fontSize:18, fontWeight:'bold'}}>
                <span>الإجمالي:</span><span>{cart.reduce((a,b)=>a+b.total, 0).toFixed(2)} د.أ</span>
              </div>
              <div className="grid-2" style={{marginBottom:10}}>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{margin:0}}>
                  <option value="Cash">كاش 💵</option><option value="Visa">فيزا 💳</option><option value="CliQ">كليك 📱</option>
                </select>
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={{margin:0}}>
                  <option value="مدفوع">مدفوع</option><option value="جزئي">عربون</option><option value="غير مدفوع">ذمة</option>
                </select>
              </div>
              <button className="btn-main" onClick={handleSaveInvoice}>✅ حفظ وطباعة</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. شاشة المتابعة (Tracking) ==================== */}
      {view === 'tracking' && (
        <div className="no-print" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
          <div style={{marginBottom: 15, background: '#fff', padding: 10, borderRadius: 12, display:'flex', gap:10, position:'relative'}}>
            <button className="close-view-btn" onClick={()=>setView('pos')}>✕</button>
            <input type="text" placeholder="🔍 بحث (رقم، اسم، هاتف)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{margin:0, flex:1, marginRight: 40}} />
            {searchTerm && <button onClick={() => setSearchTerm('')} style={{background:'#ef4444', color:'white', border:'none', padding:'0 15px', borderRadius:8}}>مسح</button>}
          </div>
          <div className="kanban-board">
            {(() => {
              const filterFn = (i: any) => !searchTerm ? true : (i.clientName.includes(searchTerm) || i.clientPhone.includes(searchTerm) || i.invoiceNumber.includes(searchTerm));
              return (
                <>
                  <div className="kanban-col" style={{background: searchTerm ? '#fff' : '#fee2e2'}}>
                    <div className="k-header" style={{color: '#b91c1c'}}>
                      <span>🚨 متأخر!</span>
                      <button onClick={playAlertSound} style={{border:'none',background:'none'}}>🔊</button>
                    </div>
                    <div style={{overflowY: 'auto', flex: 1}}>
                      {invoicesList.filter(i => i.orderStatus === 'تحت التجهيز' && new Date(i.deliveryDate) < new Date()).filter(filterFn).map(inv => (
                        <div key={inv.id} className="k-card status-delayed">
                          <strong>#{inv.invoiceNumber} - {inv.clientName}</strong>
                          <div style={{color:'red', fontSize:12}}>تأخير: {Math.ceil((new Date().getTime() - new Date(inv.deliveryDate).getTime()) / 36e5)} ساعة</div>
                          <button onClick={() => markAsReady(inv.id)} style={{width:'100%', marginTop:5, background:'#ef4444', color:'#fff', border:'none', padding:5, borderRadius:5}}>⚡ إنهاء فوراً</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="kanban-col">
                    <div className="k-header" style={{color: '#d97706'}}><span>🔥 قيد العمل</span></div>
                    <div style={{overflowY: 'auto', flex: 1}}>
                      {invoicesList.filter(i => i.orderStatus === 'تحت التجهيز' && new Date(i.deliveryDate) >= new Date()).filter(filterFn).map(inv => (
                        <div key={inv.id} className="k-card status-pending">
                          <strong>#{inv.invoiceNumber} - {inv.clientName}</strong>
                          <div style={{fontSize:12, color:'gray'}}>{inv.items.map((x:any)=>x.category).join(', ')}</div>
                          <button onClick={() => markAsReady(inv.id)} style={{width:'100%', marginTop:5, background:'#f59e0b', color:'#fff', border:'none', padding:5, borderRadius:5}}>✅ تم التجهيز</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="kanban-col">
                    <div className="k-header" style={{color: '#059669'}}><span>✨ جاهز</span></div>
                    <div style={{overflowY: 'auto', flex: 1}}>
                      {invoicesList.filter(i => i.orderStatus === 'تم التجهيز').filter(filterFn).map(inv => (
                        <div key={inv.id} className="k-card status-ready">
                          <strong>#{inv.invoiceNumber} - {inv.clientName}</strong>
                          <div style={{color: inv.remainingAmount>0?'red':'green', fontWeight:'bold'}}>{inv.remainingAmount>0 ? `باقي: ${inv.remainingAmount}` : 'خالص'}</div>
                          <div style={{display:'flex', gap:5, marginTop:5}}>
                            <button onClick={() => { const p=inv.clientPhone.startsWith('0')?'962'+inv.clientPhone.substring(1):inv.clientPhone; window.open(`https://wa.me/${p}?text=طلبك جاهز`); }} style={{flex:1, background:'#25D366', color:'white', border:'none', borderRadius:4}}>واتساب</button>
                            <button onClick={() => setDeliveryModal(inv)} style={{flex:1, background:'#10b981', color:'white', border:'none', borderRadius:4, padding:5}}>تسليم</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ==================== 3. سجل الفواتير (Archive) ==================== */}
      {view === 'invoices' && (
        <div className="no-print" style={{maxWidth:'800px', margin:'0 auto'}}>
          <div className="card">
            <button className="close-view-btn" onClick={()=>setView('pos')}>✕</button>
            <h3 style={{marginRight: 40}}>📜 سجل الفواتير (الأرشيف)</h3>
            <div style={{display:'flex', gap:10, marginBottom:15}}>
              <input type="date" value={archiveDate} onChange={e => setArchiveDate(e.target.value)} style={{margin:0}} />
              <button onClick={() => setArchiveDate('')} style={{background:'#6b7280', color:'white', border:'none', padding:'0 15px', borderRadius:8}}>عرض الكل</button>
            </div>
            
            <table style={{width:'100%', textAlign:'right', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  <th style={{padding:10}}>#</th>
                  <th>الزبون</th>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {invoicesList
                  .filter(inv => !archiveDate || inv.fullDate === archiveDate)
                  .map(inv => (
                  <tr key={inv.id} style={{borderBottom:'1px solid #eee'}}>
                    <td style={{padding:10}}>#{inv.invoiceNumber}</td>
                    <td>{inv.clientName}</td>
                    <td>{inv.fullDate}</td>
                    <td style={{fontWeight:'bold'}}>{inv.totalAmount.toFixed(2)}</td>
                    <td><span className="badge">{inv.orderStatus}</span></td>
                    <td>
                      <button 
                        onClick={() => setViewInvoiceModal(inv)}
                        style={{background:'#3b82f6', color:'white', border:'none', padding:'4px 10px', borderRadius:4, cursor:'pointer'}}
                      >
                        👁️ عرض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 4. الميزانية والتقارير (Reports) ==================== */}
      {view === 'reports' && (
        <div className="no-print" style={{maxWidth:'800px', margin:'0 auto'}}>
          <div className="card">
            <button className="close-view-btn" onClick={()=>setView('pos')}>✕</button>
            <h3 style={{marginRight: 40}}>📊 التقارير المالية والأرشيف</h3>
            
            <div style={{display:'flex', gap:10, alignItems:'center', background:'#f9fafb', padding:10, borderRadius:10, marginBottom:20}}>
              <select value={reportType} onChange={e => setReportType(e.target.value)} style={{margin:0, flex:1}}>
                <option value="daily">📅 تقرير يومي</option>
                <option value="monthly">🗓️ تقرير شهري</option>
                <option value="year">📆 تقرير سنوي (YTD)</option>
              </select>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{margin:0, flex:1}} />
            </div>

            {/* استخدمنا fin هنا لحل مشكلة المتغير غير المستخدم */}
            <div style={{textAlign: 'center', marginBottom: 20, color: '#6b7280', fontSize: 12}}>
              المبيعات الإجمالية منذ بداية النظام: <b>{fin.total.toFixed(2)}</b>
            </div>

            <div className="grid-4" style={{marginTop:20}}>
              <div className="stat-card" style={{background:'#10b981'}}>
                 <div style={{fontSize:24}}>{filteredStats.total.toFixed(2)}</div>
                 <div>المبيعات ({reportType})</div>
              </div>
              <div className="stat-card" style={{background:'#f59e0b'}}>
                 <div style={{fontSize:24}}>{filteredStats.cash.toFixed(2)}</div>
                 <div>الكاش</div>
              </div>
              <div className="stat-card" style={{background:'#ef4444'}}>
                 <div style={{fontSize:24}}>{filteredStats.exp.toFixed(2)}</div>
                 <div>المصاريف</div>
              </div>
              <div className="stat-card" style={{background:'#3b82f6'}}>
                 <div style={{fontSize:24}}>{(filteredStats.total - filteredStats.exp).toFixed(2)}</div>
                 <div>صافي الربح</div>
              </div>
            </div>
            
            <h4 style={{marginTop:20}}>تفاصيل الفترة المحددة:</h4>
            <div className="grid-2">
               <div style={{padding:10, background:'#f9fafb', borderRadius:8}}>💳 فيزا: <b>{filteredStats.visa.toFixed(2)}</b></div>
               <div style={{padding:10, background:'#f9fafb', borderRadius:8}}>📱 كليك: <b>{filteredStats.cliq.toFixed(2)}</b></div>
               <div style={{padding:10, background:'#f9fafb', borderRadius:8, color:'red'}}>📉 ديون (عامة): <b>{filteredStats.debt.toFixed(2)}</b></div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 5. الزبائن (CRM) ==================== */}
      {view === 'crm' && (
        <div className="no-print" style={{maxWidth:'600px', margin:'0 auto'}}>
          <div className="card">
            <button className="close-view-btn" onClick={()=>setView('pos')}>✕</button>
            <h3 style={{marginRight: 40}}>👥 إدارة الزبائن</h3>
            <div className="grid-2">
              <input type="text" placeholder="الاسم" value={newCrmName} onChange={e => setNewCrmName(e.target.value)} />
              <input type="tel" placeholder="الهاتف" value={newCrmPhone} onChange={e => setNewCrmPhone(e.target.value)} />
            </div>
            <button className="btn-main" onClick={async () => { if(newCrmName){ await addDoc(collection(db, 'customers'), { name: newCrmName, phone: newCrmPhone }); setNewCrmName(''); setNewCrmPhone(''); alert("تم"); } }}>حفظ</button>
          </div>
          {customers.map(c => {
             const debt = invoicesList.filter(i => i.clientPhone === c.phone).reduce((acc, curr) => acc + (curr.orderStatus !== 'ملغية' ? curr.remainingAmount : 0), 0);
             return <div key={c.id} className="card" style={{display:'flex', justifyContent:'space-between'}}><strong>{c.name}</strong><span style={{color: debt>0?'red':'green'}}>الذمة: {debt.toFixed(2)}</span></div>
          })}
        </div>
      )}

      {/* ==================== 6. المصاريف (Expenses) ==================== */}
      {view === 'expenses' && (
        <div className="no-print" style={{maxWidth:'600px', margin:'0 auto'}}>
          <div className="card">
            <button className="close-view-btn" onClick={()=>setView('pos')}>✕</button>
            <h3 style={{marginRight: 40}}>💸 تسجيل المصاريف</h3>
            <div className="grid-2">
              <input type="text" placeholder="الوصف" value={expName} onChange={e => setExpName(e.target.value)} />
              <input type="number" placeholder="المبلغ" value={expAmount} onChange={e => setExpAmount(e.target.value)} />
            </div>
            <select value={expCategory} onChange={e => setExpCategory(e.target.value)} style={{marginBottom:10}}>
              <option value="مواد تنظيف">🧴 مواد تنظيف</option>
              <option value="رواتب">👷 رواتب</option>
              <option value="فواتير">⚡ فواتير</option>
              <option value="ضيافة">☕ ضيافة</option>
              <option value="نثريات">📦 نثريات</option>
            </select>
            <button className="btn-main" style={{background:'#ef4444'}} onClick={async () => {
              if(expName && expAmount) {
                await addDoc(collection(db, 'expenses'), { name: expName, amount: Number(expAmount), category: expCategory, createdAt: Timestamp.now() });
                setExpName(''); setExpAmount(''); fetchFinancials();
              }
            }}>تسجيل -</button>
          </div>
          <div className="card">
            <table style={{width:'100%', textAlign:'right'}}>
              <thead><tr><th>المصروف</th><th>التصنيف</th><th>المبلغ</th></tr></thead>
              <tbody>{expensesList.map(e => <tr key={e.id}><td>{e.name}</td><td><span className="badge" style={{background:'#ddd', padding:4, borderRadius:4}}>{e.category}</span></td><td style={{color:'red'}}>{e.amount}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 7. الإعدادات (Settings) ==================== */}
      {view === 'settings' && (
        <div className="no-print" style={{maxWidth:'700px', margin:'0 auto'}}>
          <div className="card" style={{borderTop:'4px solid #4f46e5'}}>
            <button className="close-view-btn" onClick={()=>setView('pos')}>✕</button>
            <h3 style={{marginRight: 40}}>➕ إعدادات المنتجات</h3>
            <div className="grid-2" style={{gridTemplateColumns:'2fr 1fr 1fr 1fr'}}>
              <input type="text" placeholder="اسم الصنف (مثلاً: جاكيت)" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
              <input type="number" placeholder="السعر" value={newCatPrice} onChange={e => setNewCatPrice(e.target.value)} />
              <select value={newCatService} onChange={e => setNewCatService(e.target.value)} style={{fontSize:12}}>
                 <option value="غسيل وكوي">غسيل وكوي</option>
                 <option value="كوي فقط">كوي فقط</option>
                 <option value="غسيل فقط">غسيل فقط</option>
                 <option value="غسيل سجاد">غسيل سجاد</option>
              </select>
              <button className="btn-main" onClick={async () => {
                 if(newCatName && newCatPrice){ await addDoc(collection(db, 'products'), { name: newCatName, defaultPrice: Number(newCatPrice), serviceType: newCatService }); setNewCatName(''); setNewCatPrice(''); alert("تمت الإضافة"); }
              }}>إضافة</button>
            </div>
          </div>
          
          <div className="card">
            <h3>📋 قائمة الأسعار الحالية</h3>
            <table style={{width:'100%', textAlign:'right'}}>
              <thead><tr style={{background:'#f3f4f6'}}><th>الصنف</th><th>الخدمة</th><th>السعر</th><th>إجراء</th></tr></thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} style={{borderBottom:'1px solid #eee'}}>
                    <td style={{padding:10}}>{p.name}</td>
                    <td style={{fontSize:12, color:'#666'}}>{p.serviceType}</td>
                    <td>{p.defaultPrice}</td>
                    <td>
                      <button onClick={async()=>{ const np=prompt("السعر الجديد:", p.defaultPrice); if(np) await updateDoc(doc(db,'products',p.id),{defaultPrice:Number(np)}) }} style={{background:'#3b82f6', color:'white', border:'none', borderRadius:4, marginLeft:5, padding:'2px 8px'}}>تعديل</button>
                      <button onClick={async()=>{ if(window.confirm("حذف؟")) await deleteDoc(doc(db,'products',p.id)) }} style={{background:'#ef4444', color:'white', border:'none', borderRadius:4, padding:'2px 8px'}}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Modals (النوافذ المنبثقة) --- */}
      
      {/* مودال الخياطة */}
      {tailoringModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{width: 320}}>
             <button className="close-view-btn" onClick={()=>setTailoringModal(false)} style={{top:10, left:10, width:25, height:25, fontSize:12}}>X</button>
             <h3 style={{marginBottom:15}}>🪡 إضافة خدمة خياطة</h3>
             <textarea 
               placeholder="تفاصيل العمل (مثلاً: تضييق خصر، تركيب سحاب...)" 
               value={tailoringDetails}
               onChange={e => setTailoringDetails(e.target.value)}
               rows={3}
               style={{marginBottom:10}}
             />
             <label style={{fontSize:12, fontWeight:'bold'}}>السعر (د.أ)</label>
             <input type="number" placeholder="السعر" value={tailoringPrice} onChange={e => setTailoringPrice(e.target.value)} />
             <label style={{fontSize:12, fontWeight:'bold'}}>عدد القطع</label>
             <input type="number" placeholder="العدد" value={tailoringQty} onChange={e => setTailoringQty(e.target.value)} />
             
             <button className="btn-main" onClick={handleAddTailoring}>إضافة للفاتورة</button>
          </div>
        </div>
      )}

      {/* مودال إغلاق الشفت */}
      {shiftModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{width:320}}>
            <button className="close-view-btn" onClick={()=>setShiftModal(false)} style={{top:10, left:10, width:25, height:25, fontSize:12}}>X</button>
            <h3 style={{marginTop:10}}>🕒 إغلاق الشفت</h3>
            <select onChange={e => setCurrentShiftInfo({...currentShiftInfo, type: e.target.value})}>
              <option value="صباحي">صباحي</option><option value="مسائي">مسائي</option>
            </select>
            <input type="text" placeholder="الموظف" onChange={e => setCurrentShiftInfo({...currentShiftInfo, employee: e.target.value})} />
            <p>صافي الكاش (بعد المصاريف): <b>{(currentShiftData.cash - currentShiftData.exp).toFixed(2)}</b></p>
            <input type="number" placeholder="رصيد بداية الغد (Float)" value={cashFloat} onChange={e => setCashFloat(e.target.value)} />
            <button className="btn-main" onClick={async () => {
              await addDoc(collection(db, "shifts_archive"), { type:currentShiftInfo.type, employee:currentShiftInfo.employee, netCash: (currentShiftData.cash - currentShiftData.exp), ...currentShiftData, nextFloat:cashFloat, date:new Date().toLocaleDateString('ar-EG'), timestamp:serverTimestamp() });
              setShiftModal(false); fetchFinancials(); alert("تم الإغلاق");
            }}>حفظ وإغلاق</button>
          </div>
        </div>
      )}

      {/* مودال أرشيف الشفتات */}
      {showShiftArchiveModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{width:600, maxHeight:'80vh', overflowY:'auto'}}>
             <div style={{display:'flex', justifyContent:'space-between'}}><h3>📂 الأرشيف</h3><button onClick={()=>setShowShiftArchiveModal(false)}>X</button></div>
             <table style={{width:'100%', textAlign:'right'}}>
               <thead><tr style={{background:'#eee'}}><th>التاريخ</th><th>الشفت</th><th>الموظف</th><th>الصافي</th></tr></thead>
               <tbody>{shiftsArchive.map(s => <tr key={s.id}><td>{s.date}</td><td>{s.type}</td><td>{s.employee}</td><td>{s.netCash?.toFixed(2)}</td></tr>)}</tbody>
             </table>
          </div>
        </div>
      )}

      {/* مودال التسليم */}
      {deliveryModal && (
        <div className="modal-overlay no-print">
          <div className="card" style={{width:300}}>
            <button className="close-view-btn" onClick={()=>setDeliveryModal(null)} style={{top:10, left:10, width:25, height:25, fontSize:12}}>X</button>
            <h3 style={{marginTop:10}}>💰 تحصيل وتسليم</h3>
            <p>المطلوب: {deliveryModal.remainingAmount} د.أ</p>
            <button className="btn-main" style={{marginBottom:5}} onClick={async () => { await updateDoc(doc(db, 'invoices', deliveryModal.id), { orderStatus:'تم الاستلام', remainingAmount:0, deliveryPayMethod:'Cash' }); setDeliveryModal(null); fetchFinancials(); }}>كاش 💵</button>
            <button className="btn-main" style={{background:'#3b82f6'}} onClick={async () => { await updateDoc(doc(db, 'invoices', deliveryModal.id), { orderStatus:'تم الاستلام', remainingAmount:0, deliveryPayMethod:'Visa' }); setDeliveryModal(null); fetchFinancials(); }}>فيزا 💳</button>
          </div>
        </div>
      )}
      
      {/* مودال عرض الفاتورة (الأرشيف) */}
      {viewInvoiceModal && (
        <div className="modal-overlay no-print">
           <div className="card" style={{width: 'auto', maxWidth: 400}}>
              <h3>🧾 تفاصيل الفاتورة #{viewInvoiceModal.invoiceNumber}</h3>
              <div style={{maxHeight: '50vh', overflowY: 'auto', border: '1px solid #eee', padding: 10, borderRadius: 8}}>
                 <ReceiptTemplate inv={viewInvoiceModal} title="نسخة مؤرشفة" />
              </div>
              <button className="btn-main" onClick={() => handleReprint(viewInvoiceModal)} style={{marginTop: 10}}>🖨️ طباعة</button>
              <button onClick={() => setViewInvoiceModal(null)} style={{width: '100%', border: 'none', background: 'none', marginTop: 10}}>إغلاق</button>
           </div>
        </div>
      )}

      {/* --- Print Area (قالب الفاتورة) --- */}
      <div id="print-area" style={{ display: 'none' }}>
        {lastInvoice && (
          <>
            <div className="receipt-sep"><ReceiptTemplate inv={lastInvoice} title="نسخة العميل" /></div>
            <ReceiptTemplate inv={lastInvoice} title="نسخة المحل" />
          </>
        )}
      </div>
    </div>
  );
}

// مكون الفاتورة (للطباعة)
const ReceiptTemplate = ({ inv, title }: any) => (
  <div style={{ width: '80mm', padding: '5mm', textAlign: 'center', fontFamily: 'Arial', direction: 'rtl' }}>
    <h2 style={{margin:0}}>{SHOP_NAME}</h2>
    <p style={{fontSize:12, margin:2}}>{SHOP_PHONE}</p>
    <p style={{fontSize:10}}>{SHOP_ADDR}</p>
    <hr/><h3 style={{background:'#eee', padding:5}}>{title} #{inv.invoiceNumber}</h3>
    <div style={{textAlign:'right', fontSize:11}}>
      <p>العميل: {inv.clientName}</p><p>التاريخ: {inv.dateStr}</p>
    </div>
    <table style={{width:'100%', fontSize:12, borderCollapse:'collapse', marginTop:10}}>
      <thead><tr style={{borderBottom:'1px solid #000'}}><th align="right">المادة</th><th>الخدمة</th><th>عدد</th><th>سعر</th></tr></thead>
      <tbody>
        {inv.items?.map((it: any, idx: number) => (
          <tr key={idx} style={{borderBottom:'1px dotted #ccc'}}>
            <td>{it.category} {it.itemNote} {it.isUrgent && '(مستعجل)'}</td>
            <td style={{fontSize:10}}>{it.serviceType}</td>
            <td align="center">{it.qty}</td>
            <td align="center">{it.total.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div style={{textAlign:'left', borderTop:'1px solid #000', marginTop:10, paddingTop:5}}>
      <p>المجموع: {inv.totalAmount.toFixed(2)}</p>
      <p>المدفوع: {inv.amountPaidAtStart.toFixed(2)}</p>
      <h2 style={{margin:5}}>الباقي: {inv.remainingAmount.toFixed(2)}</h2>
    </div>
    <p style={{fontSize:10, marginTop:10}}>شكراً لزيارتكم! 🌹</p>
  </div>
);

export default App;