// Global state management
let currentUser = null;
let currentAdmin = null;
// The 'applications', 'clients', and 'activityLogs' arrays are GONE.
// We now get all data from Firestore.

// Navigation functions (These are perfect, no changes)
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Add active class to clicked nav link
    event.target.classList.add('active');
}

function showTab(tabId) {
    // Get the parent container to scope the tab switching
    const parentContainer = event.target.closest('.form-container') || event.target.closest('.section');
    
    // Hide all tab contents in this container
    parentContainer.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs in this container
    parentContainer.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(tabId).classList.add('active');
    
    // Add active class to clicked tab
    event.target.classList.add('active');
}

function showAdminTab(tabId) {
    showTab(tabId);
    
    // ** NEW **
    // When an admin tab is clicked, load its data
    if (tabId === 'view-applications-tab') {
        loadAdminApplications();
    }
    if (tabId === 'client-profiles-tab') {
        loadClientProfiles();
    }
    if (tabId === 'activity-logs-tab') {
        loadActivityLogs();
    }
}

// Client Portal Functions (Your async versions were correct)

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const company = document.getElementById('regCompanyName').value;
    const contact = document.getElementById('regContactName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (password !== confirmPassword) {
        showNotification('Passwords do not match.', 'error');
        return;
    }

    try {
        // Add a new document to the 'clients' collection
        const docRef = await db.collection("clients").add({
            company: company,
            contact: contact,
            email: email,
            password: password // Storing password in plaintext is BAD, but fits your "no security" rule
        });
        console.log("Client registered with ID: ", docRef.id);
        showNotification('Registration successful! You can now login.', 'success');
        showTab('login-tab');
    } catch (error) {
        console.error("Error adding document: ", error);
        showNotification('Registration failed. Please try again.', 'error');
    }
});

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        // Query the 'clients' collection
        const querySnapshot = await db.collection("clients")
            .where("email", "==", email)
            .where("password", "==", password)
            .get();

        if (querySnapshot.empty) {
            showNotification('Invalid email or password.', 'error');
            currentUser = null;
        } else {
            // Get the first match
            const doc = querySnapshot.docs[0];
            currentUser = { id: doc.id, ...doc.data() }; // Store logged-in user's data
            
            showNotification('Login successful! Welcome back.', 'success');
            document.getElementById('loginPrompt').style.display = 'none';
            document.getElementById('clientDashboard').classList.remove('hidden');
            
            // Call a new function to load their dashboard
            loadClientDashboard(currentUser.id); 
            showTab('dashboard-tab');
        }
    } catch (error) {
        console.error("Error logging in: ", error);
        showNotification('Login failed. Please try again.', 'error');
    }
});

document.getElementById('submitApplicationForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Check if user is logged in
    if (!currentUser) {
        showNotification('You must be logged in to submit an application.', 'error');
        showTab('login-tab');
        return;
    }

    // Validate checklist
    const checkboxes = document.querySelectorAll('#submit-tab input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    if (!allChecked) {
        showNotification('Please ensure all required documents are checked.', 'error');
        return;
    }
    
    const appNumber = 'APP' + String(Date.now()).slice(-3);
    const applicationData = {
        number: appNumber,
        title: document.getElementById('tenderTitle').value,
        value: document.getElementById('tenderValue').value,
        fundingRequired: document.getElementById('fundingRequired').value,
        duration: document.getElementById('tenderDuration').value,
        status: 'pending', // Default status
        date: new Date().toISOString().split('T')[0],
        clientId: currentUser.id, // Link to the logged-in client
        clientCompany: currentUser.company,
        clientEmail: currentUser.email
    };

    try {
        // Add a new document to the 'applications' collection
        const docRef = await db.collection("applications").add(applicationData);
        showNotification(`Application ${appNumber} submitted successfully!`, 'success');
        // Log this activity to the database
        await logActivity(`New application ${appNumber} submitted by ${currentUser.email}`);
        this.reset();
        document.getElementById('uploadedFiles').innerHTML = ''; // Clear file list
    } catch (error) {
        console.error("Error submitting application: ", error);
        showNotification('Application failed. Please try again.', 'error');
    }
});

// This loads the dashboard for the logged-in user
async function loadClientDashboard(clientId) {
    const dashboardElement = document.getElementById('recentApplications');
    dashboardElement.innerHTML = '<h4>Recent Applications</h4><p>Loading...</p>';

    try {
        const querySnapshot = await db.collection("applications")
            .where("clientId", "==", clientId)
            .orderBy("date", "desc")
            .get();
        
        if (querySnapshot.empty) {
            dashboardElement.innerHTML = '<h4>Recent Applications</h4><p>You have no applications.</p>';
            return;
        }

        let html = '<h4>Recent Applications</h4>';
        querySnapshot.forEach(doc => {
            const app = doc.data();
            html += `
                <div class="application-card">
                    <h5>${app.title} - ${app.number}</h5>
                    <p><span class="status-badge status-${app.status}">${app.status}</span></p>
                    <p>Submitted: ${app.date}</p>
                </div>
            `;
        });
        dashboardElement.innerHTML = html;

    } catch (error) {
        console.error("Error loading dashboard: ", error);
        dashboardElement.innerHTML = '<h4>Recent Applications</h4><p>Could not load applications.</p>';
    }
}

// This loads ALL applications for the admin view
async function loadAdminApplications() {
    const listElement = document.getElementById('applicationsList');
    listElement.innerHTML = '<p>Loading applications...</p>';

    try {
        const querySnapshot = await db.collection("applications").orderBy("date", "desc").get();
        
        if (querySnapshot.empty) {
            listElement.innerHTML = '<p>No applications found.</p>';
            return;
        }

        let html = '';
        querySnapshot.forEach(doc => {
            const app = doc.data();
            const appId = doc.id; // Get the Firestore document ID
            html += `
                <div class="application-card">
                    <h4>${app.title} - ${app.number}</h4>
                    <p><strong>Client:</strong> ${app.clientCompany || 'N/A'}</p>
                    <p><strong>Amount:</strong> R ${app.fundingRequired}</p>
                    <p><strong>Status:</strong> <span class="status-badge status-${app.status}">${app.status}</span></p>
                    <p><strong>Submitted:</strong> ${app.date}</p>
                    <button class="btn btn-success" onclick="processApplication('${appId}', 'approved', '${app.number}')">Approve</button>
                    <button class="btn btn-danger" onclick="processApplication('${appId}', 'rejected', '${app.number}')">Reject</button>
                </div>
            `;
        });
        listElement.innerHTML = html;

    } catch (error) {
        console.error("Error loading admin applications: ", error);
        listElement.innerHTML = '<p>Error loading applications.</p>';
    }
}

// ** NEW DYNAMIC FUNCTION **
// This loads all registered clients for the admin view
async function loadClientProfiles() {
    const listElement = document.getElementById('clientProfilesList');
    listElement.innerHTML = '<p>Loading client profiles...</p>';

    try {
        const querySnapshot = await db.collection("clients").get();
        if (querySnapshot.empty) {
            listElement.innerHTML = '<p>No clients found.</p>';
            return;
        }

        let html = '';
        querySnapshot.forEach(doc => {
            const client = doc.data();
            html += `
                <div class="application-card">
                    <h4>${client.company}</h4>
                    <p><strong>Contact:</strong> ${client.contact}</p>
                    <p><strong>Email:</strong> ${client.email}</p>
                </div>
            `;
        });
        listElement.innerHTML = html;
    } catch (error) {
        console.error("Error loading client profiles: ", error);
        listElement.innerHTML = '<p>Error loading client profiles.</p>';
    }
}

// ** NEW DYNAMIC FUNCTION **
// This loads all logs for the admin view
async function loadActivityLogs() {
    const listElement = document.getElementById('activityLogsList');
    listElement.innerHTML = '<p>Loading activity logs...</p>';

    try {
        const querySnapshot = await db.collection("logs").orderBy("timestamp", "desc").limit(20).get(); // Get last 20 logs
        if (querySnapshot.empty) {
            listElement.innerHTML = '<p>No activity logs found.</p>';
            return;
        }

        let html = '';
        querySnapshot.forEach(doc => {
            const log = doc.data();
            html += `
                <div class="application-card">
                    <p><strong>${new Date(log.timestamp.toDate()).toLocaleString()}:</strong> ${log.activity}</p>
                </div>
            `;
        });
        listElement.innerHTML = html;
    } catch (error) {
        console.error("Error loading activity logs: ", error);
        listElement.innerHTML = '<p>Error loading activity logs.</p>';
    }
}

// Admin Dashboard Functions

document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // This is still a FAKE admin login. For a demo, this is fine.
    currentAdmin = {
        username: document.getElementById('adminUsername').value,
        role: document.getElementById('adminRole').value
    };
    showNotification('Admin login successful!', 'success');
    
    // Show all admin sections
    document.getElementById('adminApplicationsView').classList.remove('hidden');
    document.getElementById('adminClientProfiles').classList.remove('hidden');
    document.getElementById('adminStatusControl').classList.remove('hidden');
    document.getElementById('adminActivityLogs').classList.remove('hidden');
    document.getElementById('adminReports').classList.remove('hidden');
    
    // Hide login prompts
    document.querySelectorAll('[id^="adminLoginPrompt"]').forEach(prompt => {
        prompt.style.display = 'none';
    });
    
    // Load real data on login
    loadAdminApplications(); 
    await logActivity(`Admin ${currentAdmin.username} logged in`);
});

// UPGRADED function to use Firestore
async function processApplication(appId, action, appNumber) {
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    
    try {
        const appRef = db.collection("applications").doc(appId);
        await appRef.update({
            status: newStatus
        });
        
        showNotification(`Application ${appNumber} has been ${newStatus}.`, 'success');
        await logActivity(`Admin ${currentAdmin?.username} set application ${appNumber} to ${newStatus}`);
        
        // Refresh the list
        loadAdminApplications(); 
    } catch (error) {
        console.error("Error updating status: ", error);
        showNotification('Error updating status.', 'error');
    }
}

// Your async trackApplication function was correct
async function trackApplication() {
    const appNumber = document.getElementById('applicationNumber').value;
    
    if (!appNumber) {
        showNotification('Please enter an application number.', 'error');
        return;
    }

    try {
        const querySnapshot = await db.collection("applications")
            .where("number", "==", appNumber)
            .get();

        if (querySnapshot.empty) {
            showNotification('Application number not found.', 'error');
            document.getElementById('statusResult').classList.add('hidden');
            return;
        }
        
        const app = querySnapshot.docs[0].data();
        
        document.getElementById('appNumber').textContent = app.number;
        document.getElementById('appStatus').innerHTML = `<span class="status-badge status-${app.status}">${app.status}</span>`;
        document.getElementById('appDate').textContent = app.date;

        // Set progress bar
        const progress = {
            'pending': 25,
            'review': 50,
            'approved': 75,
            'funded': 100,
            'rejected': 0
        };
        const progressBar = document.getElementById('progressBar');
        progressBar.style.width = (progress[app.status] || 0) + '%';
        
        // Make bar red if rejected
        if (app.status === 'rejected') {
             progressBar.style.background = '#e74c3c';
        } else {
             progressBar.style.background = '#27ae60';
        }

        document.getElementById('statusResult').classList.remove('hidden');
        
    } catch (error) {
        console.error("Error tracking application: ", error);
        showNotification('Error finding application.', 'error');
    }
}
// This connects the button to your async function. This is correct.
document.querySelector('#track-tab .btn').addEventListener('click', trackApplication);


// ** UPGRADED to be a REAL report **
async function generateReport(reportType) {
    const reportContent = document.getElementById('reportContent');
    const reportResults = document.getElementById('reportResults');
    reportContent.innerHTML = "<p>Generating real-time report...</p>";

    let content = '';
    
    try {
        // Get all applications from Firestore
        const appSnapshot = await db.collection("applications").get();
        const allApps = appSnapshot.docs.map(doc => doc.data());

        switch(reportType) {
            case 'application-summary':
                const total = allApps.length;
                const pending = allApps.filter(a => a.status === 'pending').length;
                const review = allApps.filter(a => a.status === 'review').length;
                const approved = allApps.filter(a => a.status === 'approved').length;
                const rejected = allApps.filter(a => a.status === 'rejected').length;
                const totalValue = allApps.reduce((sum, app) => sum + parseFloat(app.fundingRequired || 0), 0);

                content = `
                    <h5>Application Summary Report (Live Data)</h5>
                    <p><strong>Total Applications:</strong> ${total}</p>
                    <p><strong>Pending:</strong> ${pending}</p>
                    <p><strong>Under Review:</strong> ${review}</p>
                    <p><strong>Approved:</strong> ${approved}</p>
                    <p><strong>Rejected:</strong> ${rejected}</p>
                    <p><strong>Total Funding Requested:</strong> R ${totalValue.toLocaleString()}</p>
                `;
                break;
            case 'financial':
                // You would need more data (e.g., 'funded' status, 'repaid' amounts) for a real report
                content = `
                    <h5>Financial Summary Report (Demo)</h5>
                    <p>This report would require more database fields, like 'amountFunded' and 'amountRepaid'.</p>
                    <p>Report generation is working!</p>
                `;
                break;
            default:
                content = `<h5>Report Generated</h5><p>Report for ${reportType} has been generated successfully.</p>`;
        }

        reportContent.innerHTML = content;
        reportResults.classList.remove('hidden');
        await logActivity(`Admin ${currentAdmin?.username} generated ${reportType} report`);

    } catch (error) {
        console.error("Error generating report: ", error);
        reportContent.innerHTML = "<p>Error generating report.</p>";
    }
}

// Utility functions (Kept as-is, but logActivity is now async)

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Insert at the top of the current section
    const activeSection = document.querySelector('.section.active');
    activeSection.insertBefore(notification, activeSection.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// ** UPGRADED to write to Firestore **
async function logActivity(activity) {
    try {
        await db.collection("logs").add({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Use server time
            activity: activity
        });
    } catch (error) {
        console.error("Error logging activity: ", error);
    }
}

// Contact form (Kept as-is)
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    showNotification('Thank you for your message! We will get back to you soon.', 'success');
    this.reset();
});

// File upload handling (Kept as-is)
document.getElementById('documentUpload').addEventListener('change', function(e) {
    const files = e.target.files;
    const uploadedFiles = document.getElementById('uploadedFiles');
    
    uploadedFiles.innerHTML = '';
    for (let file of files) {
        const fileDiv = document.createElement('div');
        fileDiv.textContent = `✓ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        fileDiv.style.color = '#27ae60';
        fileDiv.style.margin = '5px 0';
        uploadedFiles.appendChild(fileDiv);
    }
});

// ** DELETE THE FAKE 'applications = [...]' ARRAY THAT WAS HERE **
// It is no longer needed.

// Status update form
// ** UPGRADED to use Firestore **
document.getElementById('statusUpdateForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const appNumber = document.getElementById('statusAppNumber').value;
    const newStatus = document.getElementById('newStatus').value;
    const notes = document.getElementById('statusNotes').value;

    if (!appNumber || !newStatus) {
        showNotification('Please enter an application number and select a new status.', 'error');
        return;
    }

    try {
        // Find the application by its 'number' field
        const querySnapshot = await db.collection("applications")
            .where("number", "==", appNumber)
            .get();
        
        if (querySnapshot.empty) {
            showNotification(`Application ${appNumber} not found.`, 'error');
            return;
        }

        // Get the document's unique ID to update it
        const docId = querySnapshot.docs[0].id;
        const appRef = db.collection("applications").doc(docId);

        await appRef.update({
            status: newStatus
        });

        showNotification(`Status updated for application ${appNumber}`, 'success');
        await logActivity(`Status of ${appNumber} changed to ${newStatus}. Notes: ${notes}`);
        this.reset();
        
        // Refresh the admin list if it's visible
        loadAdminApplications();

    } catch (error) {
        console.error("Error updating status: ", error);
        showNotification('Failed to update status. Please try again.', 'error');
    }
});

// Initialize the page (Kept as-is)
document.addEventListener('DOMContentLoaded', function() {
    // Set default dates for reports
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    
    if(document.getElementById('reportFromDate')) {
        document.getElementById('reportFromDate').value = monthAgo;
    }
    if(document.getElementById('reportToDate')) {
        document.getElementById('reportToDate').value = today;
    }
});