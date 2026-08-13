"use client";

import { useActionState } from "react";
import { updateProfileAction, type UpdateProfileState } from "@/app/actions/profile";

type ProfileEditFormProps = {
  user: {
    name: string | null;
    username: string | null;
    email: string | null;
    image: string | null;
  };
};

const initialState: UpdateProfileState = {};

export function ProfileEditForm({ user }: ProfileEditFormProps) {
  const [state, action, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={action} className="profile-edit-form">
      <label>
        <span>Display name</span>
        <input
          name="name"
          type="text"
          defaultValue={user.name || ""}
          placeholder="Your name"
          autoComplete="name"
          maxLength={80}
        />
      </label>

      <label>
        <span>Username</span>
        <input
          name="username"
          type="text"
          defaultValue={user.username || ""}
          placeholder="your-garage"
          autoComplete="username"
          minLength={3}
          maxLength={32}
          pattern="[a-z0-9_-]+"
          required
        />
        <small>Used for your public garage URL.</small>
      </label>

      <label>
        <span>Profile image URL</span>
        <input
          name="image"
          type="url"
          defaultValue={user.image || ""}
          placeholder="https://..."
          autoComplete="photo"
        />
        <small>Leave blank to use the default profile icon.</small>
      </label>

      <label>
        <span>Email</span>
        <input type="email" value={user.email || ""} disabled />
        <small>Email comes from your login provider.</small>
      </label>

      {state.error ? <p className="profile-edit-message is-error">{state.error}</p> : null}
      {state.ok ? <p className="profile-edit-message is-success">Profile updated.</p> : null}

      <button type="submit" className="profile-edit-submit" disabled={pending}>
        {pending ? "Saving..." : "Save Profile"}
      </button>
    </form>
  );
}
