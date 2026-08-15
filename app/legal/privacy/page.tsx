import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Privacy Policy",
  description: "Learn how SUPERCAR DASH collects, uses, protects, and shares information across accounts, vehicle ownership, transactions, and community features.",
  path: "/legal/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      <div className="prose prose-invert max-w-none text-sm space-y-6">
        <p className="text-[var(--text-muted)]">Last updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-xl font-semibold mt-8">INTRODUCTION</h2>
        <p>
          This privacy notice for SUPERCAR DASH ("Company," "we," "us," or "our"), describes how and why we might collect, store, use, and/or share ("process") your information when you use our services ("Services"), such as when you visit our website, engage with us for vehicle purchases, sales, financing, transport, or servicing.
        </p>
        <p>
          Reading this privacy notice will help you understand your privacy rights and choices. If you do not agree with our policies and practices, please do not use our Services.
        </p>

        <h2 className="text-xl font-semibold mt-8">1. WHAT INFORMATION DO WE COLLECT?</h2>
        <p>
          <strong>Personal information you disclose to us.</strong> We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products, participate in activities on the Services, or otherwise contact us. This may include names, phone numbers, email addresses, mailing addresses, usernames, passwords, contact preferences, financial information, vehicle identification numbers (VIN), and identity documents.
        </p>
        <p>
          <strong>Information automatically collected.</strong> We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, and information about how and when you use our Services.
        </p>

        <h2 className="text-xl font-semibold mt-8">2. HOW DO WE PROCESS YOUR INFORMATION?</h2>
        <p>
          We process your personal information for a variety of reasons, depending on how you interact with our Services, including:
        </p>
        <ul className="list-disc pl-5">
          <li>To facilitate account creation and authentication and otherwise manage user accounts.</li>
          <li>To deliver and facilitate delivery of services to the user, including vehicle transactions, service bookings, and transport quotes.</li>
          <li>To respond to user inquiries and offer support to users.</li>
          <li>To send administrative information to you about our products and services, changes to our terms and policies, and other similar information.</li>
          <li>To fulfill and manage your orders, payments, returns, and exchanges made through the Services.</li>
          <li>To protect our Services from fraud and ensure the safety of our marketplace.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2>
        <p>
          We may share information in specific situations and with specific categories of third parties, including vendors, consultants, and other third-party service providers who perform services for us or on our behalf and require access to such information to do that work. Categories include data analytics services, finance and insurance partners, payment processors, logistics and transport partners, and service centers.
        </p>

        <h2 className="text-xl font-semibold mt-8">4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</h2>
        <p>
          We may use cookies and similar tracking technologies (like web beacons and pixels) to access or store information. Specific information about how we use such technologies and how you can refuse certain cookies is set out in our Cookie Notice.
        </p>

        <h2 className="text-xl font-semibold mt-8">5. HOW LONG DO WE KEEP YOUR INFORMATION?</h2>
        <p>
          We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy notice, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements).
        </p>

        <h2 className="text-xl font-semibold mt-8">6. HOW DO WE KEEP YOUR INFORMATION SAFE?</h2>
        <p>
          We have implemented appropriate and reasonable technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure.
        </p>

        <h2 className="text-xl font-semibold mt-8">7. STATE-SPECIFIC PRIVACY RIGHTS</h2>
        <p>
          As a business based in North Carolina operating nationwide, we comply with applicable state and federal data protection laws. Depending on your state of residence (such as California, Colorado, Connecticut, Utah, or Virginia), you may have specific rights regarding your personal information, including the right to request access to, correction of, or deletion of your personal information, and the right to opt-out of certain data processing activities.
        </p>

        <h2 className="text-xl font-semibold mt-8">8. CONTACT US ABOUT THIS NOTICE</h2>
        <p>
          If you have questions or comments about this notice, you may email us or contact us by post at our principal place of business in North Carolina.
        </p>
      </div>
    </div>
  );
}
