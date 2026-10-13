let currentOrderId = null;

async function createOrder() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const amount = document.getElementById('amount').value;

  if (!name || !amount || amount <= 0) {
    alert('Please fill all fields correctly');
    return;
  }

  try {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, customerName: name, customerEmail: email }),
    });
    const data = await res.json();

    currentOrderId = data.orderId;
    document.getElementById('form-section').style.display = 'none';
    document.getElementById('payment-section').style.display = 'block';
    document.getElementById('pay-amount').textContent = data.amount;
    document.getElementById('order-id').textContent = data.orderId;

    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), {
      text: data.qrData,
      width: 200,
      height: 200,
    });

    document.getElementById('upi-link').href = data.upiLink;
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function verifyPayment() {
  if (!currentOrderId) return;

  const btn = document.getElementById('verify-btn');
  const msg = document.getElementById('status-msg');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  msg.textContent = '';

  try {
    const res = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: currentOrderId }),
    });
    const data = await res.json();

    if (data.status === 'paid') {
      msg.className = 'paid';
      msg.textContent = '✅ Payment Successful!';
      btn.textContent = 'Paid ✔';
    } else {
      msg.className = 'pending';
      msg.textContent = '⏳ Payment pending... thoda wait karke retry karein';
      btn.disabled = false;
      btn.textContent = '✅ Verify Payment';
    }
  } catch (err) {
    msg.className = 'error';
    msg.textContent = '❌ Error: ' + err.message;
    btn.disabled = false;
    btn.textContent = '✅ Verify Payment';
  }
}