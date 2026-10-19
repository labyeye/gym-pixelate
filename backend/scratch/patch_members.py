p='memberController.js'
s=open(p,newline='').read()
crlf='\r\n' in s
s=s.replace('\r\n','\n')
a='''  const { branchId, status, search, page = 1, limit = 50 } = req.query;
'''
b='''  const {
    branchId,
    status,
    search,
    page = 1,
    limit = 50,
    gender,
    goal,
    source,
    plan,
    planStatus,
  } = req.query;
'''
assert a in s
s=s.replace(a,b,1)
a='''      { phone: { $regex: search, $options: "i" } },
    ];
  }
'''
b='''      { phone: { $regex: search, $options: "i" } },
      { memberCode: { $regex: search, $options: "i" } },
    ];
  }
  if (gender) query.gender = gender;
  if (goal) query["fitness.goal"] = goal;
  if (source) query.source = source;
  if (plan || planStatus) {
    const mq = {};
    if (req.user.tenantId) mq.tenantId = req.user.tenantId;
    if (plan) mq.planName = plan;
    const soon = new Date(Date.now() + 7 * 86400000);
    if (planStatus === "active") mq.status = "active";
    else if (planStatus === "expiring") {
      mq.status = "active";
      mq.endDate = { $lte: soon };
    } else if (planStatus === "expired") mq.status = "expired";
    else if (planStatus === "dues") {
      mq.status = { $ne: "cancelled" };
      mq.$expr = { $gt: ["$totalAmount", "$paidAmount"] };
    } else mq.status = { $in: ["active", "frozen", "upcoming"] };
    if (planStatus === "none") delete mq.status;
    const ids = await Membership.distinct("memberId", mq);
    if (planStatus === "none") query._id = { $nin: ids };
    else if (planStatus === "expired") {
      const live = await Membership.distinct("memberId", {
        status: { $in: ["active", "frozen", "upcoming"] },
        ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
      });
      query._id = { $in: ids, $nin: live };
    } else query._id = { $in: ids };
  }
'''
assert a in s
s=s.replace(a,b,1)
open(p,'w',newline='').write(s.replace('\n','\r\n') if crlf else s)
