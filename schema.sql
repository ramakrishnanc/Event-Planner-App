-- Run this once in your Azure SQL Database using the Query Editor in Azure Portal

CREATE TABLE Users (
    id            NVARCHAR(50)  NOT NULL PRIMARY KEY,
    name          NVARCHAR(200) NOT NULL,
    email         NVARCHAR(200) NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    created_at    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_Users_Email UNIQUE (email)
);

CREATE TABLE PlannerData (
    user_id    NVARCHAR(50)  NOT NULL PRIMARY KEY,
    data       NVARCHAR(MAX) NOT NULL,
    updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_PlannerData_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
