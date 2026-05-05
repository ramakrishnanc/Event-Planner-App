-- Run this once in your Azure SQL Database using the Query Editor in Azure Portal.
-- For existing deployments, the API auto-creates these tables and migrates the
-- legacy Events / PlannerData rows on first request (see api/shared/db.js).

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

-- One physical table per event type. Schema is identical so the API can route
-- each event to the right table without per-type code branches.
CREATE TABLE EventsGruhapravesham (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsGruhapravesham_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsGruhapravesham_User ON EventsGruhapravesham(user_id);

CREATE TABLE EventsBirthday (
    id NVARCHAR(50) NOT NULL PRIMARY KEY, user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsBirthday_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsBirthday_User ON EventsBirthday(user_id);

CREATE TABLE EventsMarriage (
    id NVARCHAR(50) NOT NULL PRIMARY KEY, user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsMarriage_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsMarriage_User ON EventsMarriage(user_id);

CREATE TABLE EventsEngagement (
    id NVARCHAR(50) NOT NULL PRIMARY KEY, user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsEngagement_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsEngagement_User ON EventsEngagement(user_id);

CREATE TABLE EventsPuja (
    id NVARCHAR(50) NOT NULL PRIMARY KEY, user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsPuja_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsPuja_User ON EventsPuja(user_id);

CREATE TABLE EventsRetirement (
    id NVARCHAR(50) NOT NULL PRIMARY KEY, user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsRetirement_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsRetirement_User ON EventsRetirement(user_id);

CREATE TABLE EventsOther (
    id NVARCHAR(50) NOT NULL PRIMARY KEY, user_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NULL,
    m_date NVARCHAR(20) NULL, m_time NVARCHAR(20) NULL,
    m_nakshatra NVARCHAR(100) NULL, m_venue NVARCHAR(500) NULL,
    m_priest NVARCHAR(200) NULL, m_honoree NVARCHAR(200) NULL,
    m_theme NVARCHAR(200) NULL, m_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_EventsOther_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE INDEX IX_EventsOther_User ON EventsOther(user_id);

-- Children. user_id + event_type lets us delete-by-user cleanly without FKs to
-- the now-many parent tables.
CREATE TABLE EventGuests (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    user_id NVARCHAR(50) NOT NULL,
    event_id NVARCHAR(50) NOT NULL,
    event_type NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NOT NULL,
    [count] INT NOT NULL DEFAULT 1,
    invited BIT NOT NULL DEFAULT 0
);
CREATE INDEX IX_Guests_User ON EventGuests(user_id);
CREATE INDEX IX_Guests_Event ON EventGuests(event_id);

CREATE TABLE EventTasks (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    user_id NVARCHAR(50) NOT NULL,
    event_id NVARCHAR(50) NOT NULL,
    event_type NVARCHAR(50) NOT NULL,
    title NVARCHAR(500) NOT NULL,
    due NVARCHAR(20) NULL,
    done BIT NOT NULL DEFAULT 0
);
CREATE INDEX IX_Tasks_User ON EventTasks(user_id);
CREATE INDEX IX_Tasks_Event ON EventTasks(event_id);

CREATE TABLE EventExpenses (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    user_id NVARCHAR(50) NOT NULL,
    event_id NVARCHAR(50) NOT NULL,
    event_type NVARCHAR(50) NOT NULL,
    description NVARCHAR(500) NOT NULL,
    amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
    category NVARCHAR(100) NULL
);
CREATE INDEX IX_Expenses_User ON EventExpenses(user_id);
CREATE INDEX IX_Expenses_Event ON EventExpenses(event_id);

CREATE TABLE EventVendors (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    user_id NVARCHAR(50) NOT NULL,
    event_id NVARCHAR(50) NOT NULL,
    event_type NVARCHAR(50) NOT NULL,
    name NVARCHAR(200) NOT NULL,
    category NVARCHAR(50) NULL,
    phone NVARCHAR(50) NULL,
    notes NVARCHAR(MAX) NULL,
    vendor_user_id NVARCHAR(50) NULL
);
CREATE INDEX IX_EventVendors_User ON EventVendors(user_id);
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

-- Legacy table kept as a one-time migration source / backup mirror.
CREATE TABLE PlannerData (
    user_id    NVARCHAR(50)  NOT NULL PRIMARY KEY,
    data       NVARCHAR(MAX) NOT NULL,
    updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_PlannerData_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
