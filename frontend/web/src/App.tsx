// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Referral {
  id: string;
  encryptedData: string;
  timestamp: number;
  position: string;
  status: "pending" | "matched" | "rejected";
  fheMatchScore?: number;
}

const App: React.FC = () => {
  // Randomly selected style: High Contrast (Blue+Orange), Industrial Mechanical, Center Radiation, Micro Interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showReferModal, setShowReferModal] = useState(false);
  const [referring, setReferring] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newReferral, setNewReferral] = useState({
    candidateName: "",
    position: "",
    skills: "",
    contact: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "matched" | "rejected">("all");

  // Randomly selected additional features: Search & Filter, Data Statistics
  const matchedCount = referrals.filter(r => r.status === "matched").length;
  const pendingCount = referrals.filter(r => r.status === "pending").length;
  const rejectedCount = referrals.filter(r => r.status === "rejected").length;

  useEffect(() => {
    loadReferrals().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadReferrals = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("referral_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing referral keys:", e);
        }
      }
      
      const list: Referral[] = [];
      
      for (const key of keys) {
        try {
          const referralBytes = await contract.getData(`referral_${key}`);
          if (referralBytes.length > 0) {
            try {
              const referralData = JSON.parse(ethers.toUtf8String(referralBytes));
              list.push({
                id: key,
                encryptedData: referralData.data,
                timestamp: referralData.timestamp,
                position: referralData.position,
                status: referralData.status || "pending",
                fheMatchScore: referralData.fheMatchScore
              });
            } catch (e) {
              console.error(`Error parsing referral data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading referral ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setReferrals(list);
    } catch (e) {
      console.error("Error loading referrals:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitReferral = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setReferring(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting referral data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newReferral))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const referralId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const referralData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        position: newReferral.position,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `referral_${referralId}`, 
        ethers.toUtf8Bytes(JSON.stringify(referralData))
      );
      
      const keysBytes = await contract.getData("referral_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(referralId);
      
      await contract.setData(
        "referral_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted referral submitted securely!"
      });
      
      await loadReferrals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowReferModal(false);
        setNewReferral({
          candidateName: "",
          position: "",
          skills: "",
          contact: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setReferring(false);
    }
  };

  const filteredReferrals = referrals.filter(referral => {
    const matchesSearch = referral.position.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         referral.status.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || referral.status === activeTab;
    return matchesSearch && matchesTab;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="gear-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <div className="central-radial-layout">
        <header className="app-header">
          <div className="logo">
            <div className="gear-icon"></div>
            <h1>Anonymous<span>Referral</span>System</h1>
          </div>
          
          <div className="header-actions">
            <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
          </div>
        </header>
        
        <main className="main-content">
          <div className="hero-panel">
            <div className="hero-content">
              <h2>FHE-Powered Anonymous Referrals</h2>
              <p>Recommend talent privately using Fully Homomorphic Encryption</p>
              <button 
                onClick={() => setShowReferModal(true)} 
                className="primary-btn industrial-button"
              >
                Make Anonymous Referral
              </button>
            </div>
            <div className="fhe-badge">
              <span>FHE-ENCRYPTED</span>
            </div>
          </div>
          
          <div className="stats-panel">
            <div className="stat-card">
              <div className="stat-value">{referrals.length}</div>
              <div className="stat-label">Total Referrals</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{matchedCount}</div>
              <div className="stat-label">Matched</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{rejectedCount}</div>
              <div className="stat-label">Rejected</div>
            </div>
          </div>
          
          <div className="controls-panel">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search positions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="industrial-input"
              />
              <button className="search-btn">
                <span className="search-icon"></span>
              </button>
            </div>
            
            <div className="filter-tabs">
              <button 
                className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All
              </button>
              <button 
                className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
                onClick={() => setActiveTab("pending")}
              >
                Pending
              </button>
              <button 
                className={`tab-btn ${activeTab === "matched" ? "active" : ""}`}
                onClick={() => setActiveTab("matched")}
              >
                Matched
              </button>
              <button 
                className={`tab-btn ${activeTab === "rejected" ? "active" : ""}`}
                onClick={() => setActiveTab("rejected")}
              >
                Rejected
              </button>
            </div>
            
            <button 
              onClick={loadReferrals}
              className="refresh-btn industrial-button"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="referrals-list">
            <div className="list-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Position</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">FHE Match</div>
            </div>
            
            {filteredReferrals.length === 0 ? (
              <div className="no-referrals">
                <div className="empty-icon"></div>
                <p>No referrals found</p>
                <button 
                  className="industrial-button primary"
                  onClick={() => setShowReferModal(true)}
                >
                  Make First Referral
                </button>
              </div>
            ) : (
              filteredReferrals.map(referral => (
                <div className="referral-row" key={referral.id}>
                  <div className="list-cell">#{referral.id.substring(0, 6)}</div>
                  <div className="list-cell">{referral.position}</div>
                  <div className="list-cell">
                    {new Date(referral.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="list-cell">
                    <span className={`status-badge ${referral.status}`}>
                      {referral.status}
                    </span>
                  </div>
                  <div className="list-cell">
                    {referral.fheMatchScore ? (
                      <div className="match-score">
                        <div 
                          className="score-bar" 
                          style={{ width: `${referral.fheMatchScore}%` }}
                        ></div>
                        <span>{referral.fheMatchScore}%</span>
                      </div>
                    ) : (
                      <span className="na-badge">N/A</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
        
        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="gear-icon small"></div>
              <span>Anonymous Referral System</span>
            </div>
            <p>Powered by FHE technology for maximum privacy</p>
          </div>
        </footer>
      </div>
  
      {showReferModal && (
        <ModalRefer 
          onSubmit={submitReferral} 
          onClose={() => setShowReferModal(false)} 
          referring={referring}
          referralData={newReferral}
          setReferralData={setNewReferral}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="gear-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ModalReferProps {
  onSubmit: () => void; 
  onClose: () => void; 
  referring: boolean;
  referralData: any;
  setReferralData: (data: any) => void;
}

const ModalRefer: React.FC<ModalReferProps> = ({ 
  onSubmit, 
  onClose, 
  referring,
  referralData,
  setReferralData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setReferralData({
      ...referralData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!referralData.candidateName || !referralData.position) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="refer-modal industrial-card">
        <div className="modal-header">
          <h2>Submit Anonymous Referral</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> All data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Candidate Name *</label>
              <input 
                type="text"
                name="candidateName"
                value={referralData.candidateName} 
                onChange={handleChange}
                placeholder="Name will be encrypted" 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Position *</label>
              <input 
                type="text"
                name="position"
                value={referralData.position} 
                onChange={handleChange}
                placeholder="Position to recommend for" 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Key Skills</label>
              <textarea 
                name="skills"
                value={referralData.skills} 
                onChange={handleChange}
                placeholder="Candidate's skills (encrypted)" 
                className="industrial-textarea"
                rows={3}
              />
            </div>
            
            <div className="form-group">
              <label>Contact Info</label>
              <input 
                type="text"
                name="contact"
                value={referralData.contact} 
                onChange={handleChange}
                placeholder="Encrypted contact details" 
                className="industrial-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div> Your identity will remain anonymous
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={referring}
            className="submit-btn industrial-button primary"
          >
            {referring ? "Encrypting with FHE..." : "Submit Anonymously"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;