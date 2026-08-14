"use client";

import { useState } from "react";

export default function ClubLocationFields() {
  const [nationwide, setNationwide] = useState(false);

  return (
    <div className="club-location-fields">
      <div className="club-form-grid">
        <div className="club-location-city">
          <label>
            <span>City</span>
            <input name="city" placeholder="Charlotte" required={!nationwide} disabled={nationwide} />
          </label>
          <label className="club-checkbox-row club-checkbox-row-compact">
            <input
              type="checkbox"
              name="nationwide"
              value="true"
              checked={nationwide}
              onChange={(event) => setNationwide(event.target.checked)}
            />
            <span>Nationwide</span>
          </label>
        </div>
        <label>
          <span>State</span>
          <input name="state" placeholder="NC" maxLength={2} required={!nationwide} disabled={nationwide} />
        </label>
      </div>
    </div>
  );
}
