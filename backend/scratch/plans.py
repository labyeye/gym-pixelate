import io
p='backend/controllers/membershipPlanController.js'
s=io.open(p,newline='',encoding='utf-8').read()
crlf='\r\n' in s
s=s.replace('\r\n','\n')
s=s.replace('const logActivity','const Membership = require("../models/Membership");\nconst logActivity',1)
a='''  res.json({
    success: true,
    count: plans.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: plans,
  });'''
b='''  // how many members hold each plan (active now / ever)
  const counts = await Membership.aggregate([
    {
      $match: {
        planId: { $in: plans.map((p) => p._id) },
        status: { $ne: "cancelled" },
        ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
      },
    },
    {
      $group: {
        _id: "$planId",
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $in: ["$status", ["active", "frozen"]] }, 1, 0] },
        },
      },
    },
  ]);
  const byPlan = new Map(counts.map((c) => [String(c._id), c]));
  const data = plans.map((p) => ({
    ...p.toObject(),
    subscribers: {
      active: byPlan.get(String(p._id))?.active || 0,
      total: byPlan.get(String(p._id))?.total || 0,
    },
  }));

  res.json({
    success: true,
    count: plans.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data,
  });'''
assert a in s
s=s.replace(a,b,1)
io.open(p,'w',newline='',encoding='utf-8').write(s.replace('\n','\r\n') if crlf else s)

p='frontend/src/pages/gym/PlansPage.tsx'
s=io.open(p,newline='',encoding='utf-8').read()
crlf='\r\n' in s
s=s.replace('\r\n','\n')
a='''        {
          label: "Duration",'''
b='''        {
          label: "Subscribers",
          render: (r) => (
            <div>
              <p className="font-bold">{r.subscribers?.active ?? 0} active</p>
              <p className="text-xs text-black/50">
                {r.subscribers?.total ?? 0} total
              </p>
            </div>
          ),
        },
        {
          label: "Duration",'''
assert a in s
s=s.replace(a,b,1)
a='''          <StatCard
            label="Allow freezing"'''
b='''          <StatCard
            label="Active subscribers"
            value={rows.reduce((n, r) => n + (r.subscribers?.active || 0), 0)}
            icon={Users}
            color="#F59E0B"
          />
          <StatCard
            label="Allow freezing"'''
assert a in s
s=s.replace(a,b,1)
s=s.replace('import { Dumbbell, Layers, Snowflake, Tag }','import { Dumbbell, Layers, Snowflake, Tag, Users }',1)
s=s.replace('<StatGrid>','<StatGrid cols={5}>',1)
io.open(p,'w',newline='',encoding='utf-8').write(s.replace('\n','\r\n') if crlf else s)
