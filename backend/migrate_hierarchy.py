import psycopg2

def migrate():
    conn = psycopg2.connect("postgresql://postgres@127.0.0.1:5432/schnell_dashboard")
    cur = conn.cursor()

    # 1. Add corporation and division columns if not present
    cur.execute("""
        ALTER TABLE regions 
        ADD COLUMN IF NOT EXISTS corporation VARCHAR(100) DEFAULT 'Bangalore (BBMP)' NOT NULL;
    """)
    cur.execute("""
        ALTER TABLE regions 
        ADD COLUMN IF NOT EXISTS division VARCHAR(100) DEFAULT 'East' NOT NULL;
    """)
    conn.commit()
    print("Schema updated with corporation and division columns.")

    # 2. Define the exact zones and wards requested
    zones_data = [
        {
            "corporation": "Bangalore (BBMP)",
            "division": "Bommanahalli",
            "region_code": "BOM-Z1",
            "region_name": "Bommanahalli - Z1",
            "ward_start": 202,
            "ward_end": 212,
            "prefix": "BOM"
        },
        {
            "corporation": "Bangalore (BBMP)",
            "division": "East",
            "region_code": "CVRN",
            "region_name": "CVRaman Nagar",
            "ward_start": 108,
            "ward_end": 115,
            "prefix": "CVRN"
        },
        {
            "corporation": "Bangalore (BBMP)",
            "division": "East",
            "region_code": "HEB",
            "region_name": "Hebbal",
            "ward_start": 61,
            "ward_end": 68,
            "prefix": "HEB"
        },
        {
            "corporation": "Bangalore (BBMP)",
            "division": "East",
            "region_code": "PKN",
            "region_name": "PulakeshiNagar",
            "ward_start": 69,
            "ward_end": 75,
            "prefix": "PKN"
        },
        {
            "corporation": "Bangalore (BBMP)",
            "division": "East",
            "region_code": "SVN",
            "region_name": "SarvagnaNagar",
            "ward_start": 76,
            "ward_end": 85,
            "prefix": "SVN"
        },
        {
            "corporation": "Bangalore (BBMP)",
            "division": "East",
            "region_code": "STN",
            "region_name": "ShanthiNagar",
            "ward_start": 166,
            "ward_end": 172,
            "prefix": "STN"
        },
        {
            "corporation": "Bangalore (BBMP)",
            "division": "East",
            "region_code": "SJN",
            "region_name": "Sivaji Nagar",
            "ward_start": 116,
            "ward_end": 121,
            "prefix": "SJN"
        }
    ]

    # Delete extraneous regions that don't belong to the Bangalore (BBMP) hierarchy
    valid_codes = [z["region_code"] for z in zones_data]
    # Protect HEB (id 1) which has real data
    cur.execute("SELECT id, region_code FROM regions WHERE region_code NOT IN %s", (tuple(valid_codes),))
    extra_regions = cur.fetchall()
    for reg_id, reg_code in extra_regions:
        print(f"Removing extraneous region {reg_code} (id={reg_id})")
        cur.execute("DELETE FROM regions WHERE id = %s", (reg_id,))
    conn.commit()

    # Now create or update each zone
    for z in zones_data:
        cur.execute("SELECT id FROM regions WHERE region_code = %s", (z["region_code"],))
        row = cur.fetchone()
        if row:
            region_id = row[0]
            cur.execute("""
                UPDATE regions 
                SET region_name = %s, corporation = %s, division = %s
                WHERE id = %s
            """, (z["region_name"], z["corporation"], z["division"], region_id))
            print(f"Updated zone: {z['region_name']} ({z['region_code']})")
        else:
            cur.execute("""
                INSERT INTO regions (region_code, region_name, corporation, division, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                RETURNING id
            """, (z["region_code"], z["region_name"], z["corporation"], z["division"]))
            region_id = cur.fetchone()[0]
            print(f"Created zone: {z['region_name']} ({z['region_code']})")

        # Now ensure all wards in range exist
        for w_num in range(z["ward_start"], z["ward_end"] + 1):
            ward_num_str = f"W{w_num}"
            ward_code = f"{z['prefix']}-{ward_num_str}"
            ward_name = ward_num_str

            # Check if ward already exists under this region
            cur.execute("SELECT id, ward_name FROM wards WHERE region_id = %s AND ward_number = %s", (region_id, ward_num_str))
            ward_row = cur.fetchone()
            if not ward_row:
                cur.execute("""
                    INSERT INTO wards (region_id, ward_number, ward_name, ward_code, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                """, (region_id, ward_num_str, ward_name, ward_code))
                print(f"  + Added ward {ward_code}")
            else:
                # Update ward code format and clean ward name if needed
                cur.execute("""
                    UPDATE wards 
                    SET ward_code = %s, ward_name = %s
                    WHERE id = %s
                """, (ward_code, ward_name, ward_row[0]))

        conn.commit()

    print("\nMigration completed successfully!")
    # Verification count
    cur.execute("SELECT COUNT(*) FROM regions")
    print("Total Zones/Regions:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM wards")
    print("Total Wards:", cur.fetchone()[0])
    cur.execute("SELECT id, ward_code, (SELECT COUNT(*) FROM poles WHERE ward_id = wards.id) FROM wards WHERE ward_number = 'W64'")
    w64_info = cur.fetchone()
    print("Ward 64 Status:", w64_info)

    conn.close()

if __name__ == "__main__":
    migrate()
