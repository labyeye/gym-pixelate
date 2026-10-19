import {
  Award, BadgeCheck, Briefcase, Building2, Calendar, Clock, CreditCard, FileText, Globe, HeartPulse, Hash, IndianRupee, KeyRound,
  Landmark, Layers, Lock, Mail, MapPin, Megaphone, Package, Phone, PhoneCall, Ruler, Scale, Tag, Target, User, Users,
} from 'lucide-react-native';

// First keyword found in a label / title picks its icon (same table as the web app).
const ICONS: [string[], any][] = [
  [['emergency'], PhoneCall],
  [['email', 'e-mail'], Mail],
  [['phone', 'mobile', 'whatsapp', 'contact no'], Phone],
  [['password', 'otp'], Lock],
  [['api key', 'token', 'secret', 'key id'], KeyRound],
  [['website', 'url', 'link'], Globe],
  [['pincode', 'pin code', 'address', 'state', 'city', 'location', 'room', 'studio', 'zone'], MapPin],
  [['date', 'due', 'follow-up', 'schedule', 'birth', 'dob', 'joining', 'from', 'until', 'valid', 'expiry'], Calendar],
  [['time', 'slot', 'shift', 'duration', 'start', 'end', 'hours'], Clock],
  [['height', 'waist'], Ruler],
  [['weight', 'water'], Scale],
  [['bank', 'ifsc', 'account'], Landmark],
  [['salary', '₹', 'price', 'fee', 'discount', 'collect', 'refund', 'commission', 'gst', 'rate', 'cost', 'amount', 'balance', 'rent', 'deposit'], IndianRupee],
  [['method', 'payment', 'reference', 'txn'], CreditCard],
  [['pan', 'aadhaar', 'id proof', 'id number', 'employee id'], BadgeCheck],
  [['goal', 'target', 'outcome'], Target],
  [['diet', 'supplement', 'medic', 'injur', 'calorie', 'protein', 'health', 'blood', 'allerg'], HeartPulse],
  [['sku', 'stock', 'reorder', 'opening', 'product', 'item', 'quantity'], Package],
  [['experience', 'special', 'level', 'certification'], Award],
  [['company', 'gym name', 'branch', 'department'], Building2],
  [['occupation', 'designation', 'role', 'position'], Briefcase],
  [['how did', 'source', 'campaign'], Megaphone],
  [['gender', 'relation', 'trainer', 'assign', 'client', 'languages'], Users],
  [['name', 'member', 'login', 'staff', 'employee', 'user'], User],
  [['note', 'reason', 'description', 'remark', 'comment', 'message', 'what was', 'bio', 'terms', 'footer'], FileText],
  [['plan', 'package', 'category', 'type', 'membership', 'status', 'mode', 'prefix'], Tag],
  [['max', 'sessions', 'number', 'count', 'limit', 'total', 'age'], Hash],
];

const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// keywords match at the start of a word ("pan" matches "PAN number", not "company")
const RULES = ICONS.map(
  ([keys, Icon]) => [new RegExp(keys.map(k => (/^\w/.test(k) ? '\\b' : '') + esc(k)).join('|')), Icon] as const,
);

export const iconFor = (text: string): any => {
  const t = (text || '').toLowerCase();
  for (const [re, Icon] of RULES) if (re.test(t)) return Icon;
  return Layers;
};

/** "Weight (kg)" -> "weight" */
export const plain = (label: string) =>
  label.replace(/\(.*?\)/g, '').replace(/[*:?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
