-- Run this once in your Azure SQL Database using the Query Editor in Azure Portal.
-- For existing deployments, the API auto-creates these tables and migrates the
-- legacy PlannerData JSON blob on first request (see api/shared/db.js).

CREATE TABLE Users (
    id              NVARCHAR(50)  NOT NULL PRIMARY KEY,
    name            NVARCHAR(200) NOT NULL,
    email           NVARCHAR(200) NOT NULL,
    password_hash   NVARCHAR(255) NOT NULL,
    role            NVARCHAR(20)  NOT NULL DEFAULT 'user',
    vendor_category NVARCHAR(50)  NULL,
    vendor_phone    NVARCHAR(50)  NULL,
    vendor_city     NVARCHAR(100) NULL,
    pin             NVARCHAR(10)  NULL,
    created_at      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_Users_Email UNIQUE (email)
);

CREATE TABLE Events (
    id           NVARCHAR(50)  NOT NULL PRIMARY KEY,
    user_id      NVARCHAR(50)  NOT NULL,
    type_id      NVARCHAR(50)  NOT NULL,
    name         NVARCHAR(200) NULL,
    m_date       NVARCHAR(20)  NULL,
    m_time       NVARCHAR(20)  NULL,
    m_nakshatra  NVARCHAR(100) NULL,
    m_venue      NVARCHAR(500) NULL,
    m_priest     NVARCHAR(200) NULL,
    m_honoree    NVARCHAR(200) NULL,
    m_theme      NVARCHAR(200) NULL,
    m_notes      NVARCHAR(MAX) NULL,
    created_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Events_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_Events_User ON Events(user_id);

CREATE TABLE EventGuests (
    id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
    event_id  NVARCHAR(50)  NOT NULL,
    name      NVARCHAR(200) NOT NULL,
    [count]   INT           NOT NULL DEFAULT 1,
    invited   BIT           NOT NULL DEFAULT 0,
    CONSTRAINT FK_Guests_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
);
CREATE INDEX IX_Guests_Event ON EventGuests(event_id);

CREATE TABLE EventTasks (
    id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
    event_id  NVARCHAR(50)  NOT NULL,
    title     NVARCHAR(500) NOT NULL,
    due       NVARCHAR(20)  NULL,
    done      BIT           NOT NULL DEFAULT 0,
    CONSTRAINT FK_Tasks_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
);
CREATE INDEX IX_Tasks_Event ON EventTasks(event_id);

CREATE TABLE EventExpenses (
    id           NVARCHAR(50)   NOT NULL PRIMARY KEY,
    event_id     NVARCHAR(50)   NOT NULL,
    description  NVARCHAR(500)  NOT NULL,
    amount       DECIMAL(18, 2) NOT NULL DEFAULT 0,
    category     NVARCHAR(100)  NULL,
    CONSTRAINT FK_Expenses_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
);
CREATE INDEX IX_Expenses_Event ON EventExpenses(event_id);

CREATE TABLE EventVendors (
    id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
    event_id  NVARCHAR(50)  NOT NULL,
    name      NVARCHAR(200) NOT NULL,
    category  NVARCHAR(50)  NULL,
    phone     NVARCHAR(50)  NULL,
    notes     NVARCHAR(MAX) NULL,
    CONSTRAINT FK_EventVendors_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
);
CREATE INDEX IX_EventVendors_Event ON EventVendors(event_id);

CREATE TABLE VendorBookings (
    id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
    user_id     NVARCHAR(50)  NOT NULL,
    client      NVARCHAR(200) NOT NULL,
    type        NVARCHAR(100) NULL,
    [date]      NVARCHAR(20)  NULL,
    venue       NVARCHAR(500) NULL,
    created_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Bookings_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_Bookings_User ON VendorBookings(user_id);

-- Legacy table kept as a one-time migration source. The API will read from it
-- on first access for each user and split the JSON into the tables above.
CREATE TABLE PlannerData (
    user_id    NVARCHAR(50)  NOT NULL PRIMARY KEY,
    data       NVARCHAR(MAX) NOT NULL,
    updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_PlannerData_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
