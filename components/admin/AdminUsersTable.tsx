"use client";

import { useState, useTransition } from "react";
import { removeUserAction } from "@/app/actions/admin-management";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  createdAt: string;
  activeSessionCount: number;
  vehicleCount: number;
  listingCount: number;
  fulfillmentCount: number;
  isCurrentAdmin: boolean;
};

export function AdminUsersTable({ users, totalCount }: { users: AdminUserRow[]; totalCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const removeUser = (user: AdminUserRow) => {
    const label = user.email || user.name || user.id;
    const confirmed = window.confirm(
      `Remove ${label}? This will delete the user account and related login/session records.`
    );

    if (!confirmed) return;

    setProcessingId(user.id);
    setMessage(null);

    startTransition(async () => {
      const result = await removeUserAction(user.id);
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      setProcessingId(null);
    });
  };

  return (
    <section className="surface-panel admin-management-panel">
      <div className="admin-management-panel-header">
        <div>
          <p className="eyebrow">Users</p>
          <h2>All Users</h2>
        </div>
        <span>{users.length.toLocaleString()} shown of {totalCount.toLocaleString()} total</span>
      </div>

      {message && (
        <div className={`admin-action-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="mobile-scroll admin-management-table-shell">
        <table className="admin-management-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Active Sessions</th>
              <th>Vehicles</th>
              <th>Listings</th>
              <th>Transactions</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-management-empty">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isBusy = isPending && processingId === user.id;

                return (
                  <tr key={user.id}>
                    <td data-label="User">
                      <strong>{user.name || "Unnamed user"}</strong>
                      <span>{user.email || user.id}</span>
                    </td>
                    <td data-label="Role">
                      <span className="admin-status-pill">{user.role || "USER"}</span>
                    </td>
                    <td data-label="Active Sessions">{user.activeSessionCount}</td>
                    <td data-label="Vehicles">{user.vehicleCount}</td>
                    <td data-label="Listings">{user.listingCount}</td>
                    <td data-label="Transactions">{user.fulfillmentCount}</td>
                    <td data-label="Joined">{user.createdAt}</td>
                    <td data-label="Actions">
                      <button
                        type="button"
                        className="admin-danger-button"
                        onClick={() => removeUser(user)}
                        disabled={isBusy || user.isCurrentAdmin}
                        title={user.isCurrentAdmin ? "You cannot remove the account you are using." : undefined}
                      >
                        {isBusy ? "Removing" : "Remove"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
