import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Financial Privacy Notice",
  description: "Review the SUPERCAR DASH financial privacy notice and how personal financial information is handled in transaction and referral workflows.",
  path: "/legal/financial-privacy",
});

export default function FinancialPrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Financial Privacy Notice</h1>
      <div className="prose prose-invert max-w-none text-sm space-y-6">
        <p className="text-[var(--text-muted)]">Effective Date: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-xl font-semibold mt-8">INTRODUCTION</h2>
        <p>
          This page describes how SUPERCAR DASH, together with its parents, subsidiaries, and affiliates handles certain types of your personal data. This includes how we handle certain personal data that is subject to certain laws, such as data subject to the Fair Credit Reporting Act ("FCRA") and the Gramm-Leach-Bliley Act ("GLBA").
        </p>
        
        <div className="border border-[var(--border-subtle)] p-6 rounded-lg my-8 bg-[var(--background-secondary)]">
          <h2 className="text-xl font-semibold mt-0 mb-4">FACTS: WHAT DOES SUPERCAR DASH DO WITH YOUR PERSONAL INFORMATION?</h2>
          
          <h3 className="font-semibold mt-4">Why?</h3>
          <p>
            Financial companies choose how they share your personal information. Federal law gives consumers the right to limit some but not all sharing. Federal law also requires us to tell you how we collect, share, and protect your personal information. Please read this notice carefully to understand what we do.
          </p>

          <h3 className="font-semibold mt-4">What?</h3>
          <p>
            The types of personal information we collect and share depend on the product or service you have with us. This information can include:
          </p>
          <ul className="list-disc pl-5 mb-4">
            <li>Social Security number and income</li>
            <li>Account balances and payment history</li>
            <li>Credit history and credit scores</li>
          </ul>
          <p>
            When you are no longer our customer, we continue to share your information as described in this notice.
          </p>

          <h3 className="font-semibold mt-4">How?</h3>
          <p>
            All financial companies need to share customers' personal information to run their everyday business. In the section below, we list the reasons financial companies can share their customers' personal information; the reasons SUPERCAR DASH chooses to share; and whether you can limit this sharing.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8">REASONS WE CAN SHARE YOUR PERSONAL INFORMATION</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-[var(--border-subtle)]">
            <thead>
              <tr className="bg-[var(--background-tertiary)]">
                <th className="p-3 border border-[var(--border-subtle)]">Reasons we can share your personal information</th>
                <th className="p-3 border border-[var(--border-subtle)]">Does SUPERCAR DASH share?</th>
                <th className="p-3 border border-[var(--border-subtle)]">Can you limit this sharing?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For our everyday business purposes</strong>—such as to process your transactions, maintain your account(s), respond to court orders and legal investigations, or report to credit bureaus</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">No</td>
              </tr>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For our marketing purposes</strong>—to offer our products and services to you</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">No</td>
              </tr>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For joint marketing with other financial companies</strong></td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">No</td>
              </tr>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For our affiliates' everyday business purposes</strong>—information about your transactions and experiences</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">No</td>
              </tr>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For our affiliates' everyday business purposes</strong>—information about your creditworthiness</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
              </tr>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For our affiliates to market to you</strong></td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">Yes</td>
              </tr>
              <tr>
                <td className="p-3 border border-[var(--border-subtle)]"><strong>For nonaffiliates to market to you</strong></td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">No</td>
                <td className="p-3 border border-[var(--border-subtle)] text-center">We don't share</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-semibold mt-8">WHO WE ARE</h2>
        <p><strong>Who is providing this notice?</strong> SUPERCAR DASH and its financial and automotive affiliates.</p>

        <h2 className="text-xl font-semibold mt-8">WHAT WE DO</h2>
        <p><strong>How does SUPERCAR DASH protect my personal information?</strong> To protect your personal information from unauthorized access and use, we use security measures that comply with federal law. These measures include computer safeguards and secured files and buildings.</p>
        <p><strong>How does SUPERCAR DASH collect my personal information?</strong> We collect your personal information, for example, when you apply for financing, give us your income information, provide employment information, show your driver's license, or provide account information. We also collect your personal information from others, such as credit bureaus, affiliates, or other companies.</p>

        <h2 className="text-xl font-semibold mt-8">DEFINITIONS</h2>
        <p><strong>Affiliates:</strong> Companies related by common ownership or control. They can be financial and nonfinancial companies.</p>
        <p><strong>Nonaffiliates:</strong> Companies not related by common ownership or control. They can be financial and nonfinancial companies.</p>
        <p><strong>Joint Marketing:</strong> A formal agreement between nonaffiliated financial companies that together market financial products or services to you.</p>

        <h2 className="text-xl font-semibold mt-8">OTHER IMPORTANT INFORMATION</h2>
        <p><strong>For North Carolina Customers:</strong> We will not share personal information with nonaffiliates either for them to market to you or for joint marketing - without your authorization. We will also not share personal information with affiliates for them to market to you, without your authorization.</p>
        <p><strong>For California Customers:</strong> We will not share personal information with nonaffiliates either for them to market to you or for joint marketing - without your authorization. We will also not share personal information with affiliates for them to market to you, without your authorization.</p>
        <p><strong>For Vermont Customers:</strong> We will not disclose information about your creditworthiness to our affiliates and will not disclose your personal information, financial information, credit report, or health information to nonaffiliated third parties to market to you, other than as permitted by Vermont law, unless you authorize us to make those disclosures.</p>
      </div>
    </div>
  );
}
