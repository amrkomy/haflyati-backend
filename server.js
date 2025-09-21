const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://cchslpjpqqopbxatioes.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjaHNscGpwcXFvcGJ4YXRpb2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEzNzA5NywiZXhwIjoyMDY4NzEzMDk3fQ.4W77yukQcvIeoeHCSOJahoBra0AuIFMig_oxOo0UWCg'
);

app.get('/', (req, res) => {
  res.json({ message: "✅ Backend حفلاتي - يعمل بنجاح!" });
});

// ➕ إضافة بائع — تم التصحيح هنا 👇
app.post('/api/vendors', async (req, res) => {
  const { fullname, email, password } = req.body;

  if (!fullname || !email || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال الاسم الكامل، البريد الإلكتروني، وكلمة المرور' });
  }

  try {
    // ✅ التصحيح: user_metadata: { ... } ← النقطتان والفاصلة مهمة!
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {  // ← تم التصحيح هنا!
        full_name: fullname,
        role: 'vendor'
      }
    });

    if (error) {
      console.error("Supabase Error (Create User):", error);
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: '✅ تم إنشاء البائع بنجاح',
      user: data
    });
  } catch (err) {
    console.error("Server Error (Create Vendor):", err);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء إنشاء البائع' });
  }
});

// 📋 جلب البائعين
app.get('/api/vendors', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Supabase Error (List Users):", error);
      return res.status(400).json({ error: error.message });
    }

    const vendors = data.users.filter(user => 
      user.user_metadata?.role === 'vendor'
    );

    res.json(vendors);
  } catch (err) {
    console.error("Server Error (List Vendors):", err);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء جلب البائعين' });
  }
});

// 🗑️ حذف بائع
app.delete('/api/vendors/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase.auth.admin.deleteUser(id);

    if (error) {
      console.error("Supabase Error (Delete User):", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: '✅ تم حذف البائع بنجاح' });
  } catch (err) {
    console.error("Server Error (Delete Vendor):", err);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء حذف البائع' });
  }
});

// 🎟️ جلب تذاكر البائع
app.get('/api/vendors/:id/tickets', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('vendor_id', id)
      .eq('is_valid', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase Error (Tickets):", error);
      return res.status(400).json({ error: error.message });
    }

    res.json(tickets);
  } catch (err) {
    console.error("Server Error (Tickets):", err);
    res.status(500).json({ error: 'فشل في جلب التذاكر' });
  }
});

// 📊 جلب إحصاءات البائع
app.get('/api/vendors/:id/stats', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: categories, error: catError } = await supabase
      .from('Category')
      .select('name, price');

    if (catError) {
      throw catError;
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('*')
      .eq('vendor_id', id)
      .eq('is_valid', true);

    if (ticketsError) {
      throw ticketsError;
    }

    let totalRevenue = 0;
    let totalTickets = 0;
    let scannedTickets = 0;
    let groupTickets = 0;
    let individualTickets = 0;
    let categoryStats = [];

    for (const cat of categories) {
      const categoryIndividualTickets = tickets.filter(t => 
        t.category === cat.name && (!t.people_count || t.people_count === 1)
      );
      
      const categoryGroupTickets = tickets.filter(t => 
        t.category === cat.name && t.people_count && t.people_count > 1
      );

      const individualCount = categoryIndividualTickets.length;
      individualTickets += individualCount;

      let groupCount = 0;
      let groupRevenue = 0;
      
      for (const groupTicket of categoryGroupTickets) {
        const peopleCount = groupTicket.people_count || 1;
        groupCount += peopleCount;
        groupRevenue += peopleCount * cat.price;
        if (groupTicket.scanned) {
          scannedTickets += peopleCount;
        }
      }

      groupTickets += groupCount;
      const totalCategoryCount = individualCount + groupCount;
      const categoryRevenue = (individualCount * cat.price) + groupRevenue;
      totalRevenue += categoryRevenue;
      totalTickets += totalCategoryCount;

      const scannedIndividual = categoryIndividualTickets.filter(t => t.scanned).length;
      scannedTickets += scannedIndividual;

      if (totalCategoryCount > 0) {
        categoryStats.push({
          name: cat.name,
          price: cat.price,
          individualCount,
          groupCount,
          totalTickets: totalCategoryCount,
          scannedIndividual,
          scannedGroups: categoryGroupTickets.filter(t => t.scanned).length,
          revenue: categoryRevenue
        });
      }
    }

    const stats = {
      vendorId: id,
      totalRevenue,
      totalTickets,
      scannedTickets,
      remainingTickets: totalTickets - scannedTickets,
      individualTickets,
      groupTickets,
      scanPercentage: totalTickets > 0 ? Math.round((scannedTickets / totalTickets) * 100) : 0,
      categories: categoryStats
    };

    res.json(stats);
  } catch (err) {
    console.error("Server Error (Stats):", err);
    res.status(500).json({ error: 'فشل في جلب الإحصاءات' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 خادم حفلاتي يعمل على http://localhost:${PORT}`);
  console.log(`🎯 جرب: http://localhost:${PORT}/api/vendors`);
});