import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Book, 
  Scale, 
  Briefcase, 
  FileText, 
  Gavel, 
  Download, 
  Star, 
  Share2, 
  Plus, 
  Settings, 
  LogOut, 
  LogIn,
  ChevronRight,
  Filter,
  BarChart3,
  X,
  Menu,
  Edit,
  Trash2,
  UploadCloud,
  Save,
  ArrowLeft,
  Tag,
  Hammer,
  Shield,
  Users,
  Landmark,
  Globe,
  Copy,
  Check,
  Eye,
  ExternalLink,
  AlertCircle
} from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  Book, Scale, Briefcase, FileText, Gavel, Tag, Hammer, Shield, Users, Landmark, Globe, Edit, Trash2, UploadCloud, Save
};

const CategoryIcon = ({ name, className }: { name?: string, className?: string }) => {
  const Icon = name && ICON_MAP[name] ? ICON_MAP[name] : Tag;
  return <Icon className={className} />;
};
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  getDocs,
  getDocFromServer,
  Timestamp,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  writeBatch,
  storage,
  OperationType,
  handleFirestoreError
} from './firebase';
import { Law, Category, UserProfile, Favorite } from './types';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      if (e.error?.message?.startsWith('{')) {
        setHasError(true);
        setErrorInfo(e.error.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-4">
        <h2 className="text-red-800 font-bold mb-2">Erro de Permissão ou Sistema</h2>
        <pre className="text-xs text-red-600 overflow-auto max-h-40">
          {errorInfo ? JSON.stringify(JSON.parse(errorInfo), null, 2) : 'Erro desconhecido'}
        </pre>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Recarregar App
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [laws, setLaws] = useState<Law[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]); // Array of law IDs
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewingLaw, setViewingLaw] = useState<Law | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          // Update photo if changed
          if (firebaseUser.photoURL && data.photoURL !== firebaseUser.photoURL) {
            await updateDoc(doc(db, 'users', firebaseUser.uid), { photoURL: firebaseUser.photoURL });
            data.photoURL = firebaseUser.photoURL;
          }
          setUser(data);
        } else {
          // Default admin check from rules logic
          const role = firebaseUser.email === 'moianeaabel@gmail.com' ? 'admin' : 'user';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: role as 'admin' | 'user',
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || ''
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setUser(newProfile);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    const qLaws = query(collection(db, 'laws'));
    const unsubLaws = onSnapshot(qLaws, (snapshot) => {
      setLaws(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Law)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'laws'));

    const qCats = query(collection(db, 'categories'));
    const unsubCats = onSnapshot(qCats, (snapshot) => {
      const cats = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Category));
      setCategories(cats);
      // Seed default categories if empty
      if (cats.length === 0 && user?.role === 'admin') {
        const defaults = [
          { name: 'Constituição', icon: 'Book' },
          { name: 'Código Civil', icon: 'Scale' },
          { name: 'Código Penal', icon: 'Gavel' },
          { name: 'Lei do Trabalho', icon: 'Briefcase' },
          { name: 'Jurisprudência', icon: 'FileText' }
        ];
        defaults.forEach(async (c) => {
          try {
            await addDoc(collection(db, 'categories'), c);
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'categories');
          }
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'categories'));

    return () => {
      unsubLaws();
      unsubCats();
    };
  }, [user]);

  // Favorites Listener
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    const qFavs = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    const unsubFavs = onSnapshot(qFavs, (snapshot) => {
      setFavorites(snapshot.docs.map(d => (d.data() as Favorite).lawId));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'favorites'));
    return () => unsubFavs();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => signOut(auth);

  const toggleFavorite = async (lawId: string) => {
    if (!user) return;
    const existing = favorites.includes(lawId);
    if (existing) {
      // Find and delete
      const q = query(collection(db, 'favorites'), where('userId', '==', user.uid), where('lawId', '==', lawId));
      const snap = await getDocs(q);
      snap.forEach(d => deleteDoc(doc(db, 'favorites', d.id)));
    } else {
      await addDoc(collection(db, 'favorites'), {
        userId: user.uid,
        lawId,
        createdAt: Timestamp.now()
      });
    }
  };

  const incrementDownload = async (law: Law) => {
    if (!user) {
      alert('Por favor, faça login para baixar documentos.');
      handleLogin();
      return;
    }
    
    try {
      await updateDoc(doc(db, 'laws', law.id), {
        downloadCount: (law.downloadCount || 0) + 1
      });

      // Force download
      const response = await fetch(law.pdfUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${law.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar arquivo:', err);
      // Fallback to opening in new tab if fetch fails (e.g. CORS)
      window.open(law.pdfUrl, '_blank');
    }
  };

  const handleDeleteLaw = async (law: Law) => {
    if (!confirm(`Tem certeza que deseja apagar a lei "${law.title}"?`)) return;
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'laws', law.id));
      
      // Delete from Storage if exists
      if (law.pdfUrl && law.pdfUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const fileRef = ref(storage, law.pdfUrl);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.error('Erro ao apagar arquivo do Storage:', storageErr);
        }
      }
      
      alert('Lei e arquivos associados apagados!');
      if (viewingLaw?.id === law.id) setViewingLaw(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'laws');
    }
  };

  const filteredLaws = laws.filter(l => {
    const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          l.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedCategory === 'favorites') {
      return matchesSearch && favorites.includes(l.id);
    }

    const matchesCategory = !selectedCategory || l.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setViewingLaw(null); setIsAdminPanelOpen(false); }}>
                <Scale className="w-8 h-8 text-emerald-700" />
                <span className="text-xl font-bold tracking-tight text-emerald-900">LexMoz</span>
              </div>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center gap-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input 
                    type="text"
                    placeholder="Pesquisar leis, artigos..."
                    className="pl-10 pr-4 py-2 bg-stone-100 border-none rounded-full text-sm focus:ring-2 focus:ring-emerald-500 w-64 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                {user?.role === 'admin' && (
                  <button 
                    onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                    className="flex items-center gap-2 text-stone-600 hover:text-emerald-700 font-medium"
                  >
                    <Settings className="w-4 h-4" />
                    Admin
                  </button>
                )}

                {user ? (
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Usuário</p>
                      <p className="text-sm font-medium">{user.displayName}</p>
                    </div>
                    {user.photoURL && (
                      <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-stone-200" />
                    )}
                    <button onClick={handleLogout} className="p-2 text-stone-400 hover:text-red-500 transition" title="Sair">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-full hover:bg-emerald-800 transition shadow-md"
                  >
                    <LogIn className="w-4 h-4" />
                    Entrar
                  </button>
                )}
              </div>

              {/* Mobile Menu Toggle */}
              <button className="md:hidden p-2" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="md:hidden bg-white border-b border-stone-200 p-4 space-y-4"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  type="text"
                  placeholder="Pesquisar..."
                  className="pl-10 pr-4 py-2 bg-stone-100 border-none rounded-full text-sm w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {user && (
                <button onClick={() => { setSelectedCategory('favorites'); setIsMobileMenuOpen(false); }} className="w-full text-left py-2 font-medium flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Meus Favoritos
                </button>
              )}
              {user?.role === 'admin' && (
                <button onClick={() => { setIsAdminPanelOpen(true); setIsMobileMenuOpen(false); }} className="w-full text-left py-2 font-medium">Admin Panel</button>
              )}
              {user ? (
                <button onClick={handleLogout} className="w-full text-left py-2 text-red-600 font-medium">Sair</button>
              ) : (
                <button onClick={handleLogin} className="w-full text-center bg-emerald-700 text-white py-2 rounded-full">Entrar</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {isAdminPanelOpen ? (
            <AdminPanel 
              categories={categories} 
              onClose={() => setIsAdminPanelOpen(false)} 
              laws={laws}
              onDeleteLaw={handleDeleteLaw}
            />
          ) : viewingLaw ? (
            <LawViewer 
              law={viewingLaw} 
              onBack={() => setViewingLaw(null)} 
              isFavorite={favorites.includes(viewingLaw.id)}
              onToggleFavorite={() => toggleFavorite(viewingLaw.id)}
              onDownload={() => incrementDownload(viewingLaw)}
              onDelete={() => handleDeleteLaw(viewingLaw)}
              user={user}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Sidebar Filters */}
              <aside className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Categorias</h3>
                  <div className="space-y-1">
                    <button 
                      onClick={() => setSelectedCategory(null)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition",
                        !selectedCategory ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-stone-600 hover:bg-stone-100"
                      )}
                    >
                      Todas as Leis
                      {!selectedCategory && <ChevronRight className="w-4 h-4" />}
                    </button>
                    {categories.map(cat => (
                      <button 
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                          selectedCategory === cat.id ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-stone-600 hover:bg-stone-100"
                        )}
                      >
                        <CategoryIcon name={cat.icon} className="w-4 h-4 opacity-70" />
                        <span className="flex-1 text-left">{cat.name}</span>
                        {selectedCategory === cat.id && <ChevronRight className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </div>

                {user && (
                  <button 
                    onClick={() => setSelectedCategory(selectedCategory === 'favorites' ? null : 'favorites')}
                    className={cn(
                      "w-full p-4 rounded-2xl text-white shadow-xl overflow-hidden relative transition transform hover:scale-[1.02] active:scale-[0.98]",
                      selectedCategory === 'favorites' ? "bg-amber-600" : "bg-emerald-900"
                    )}
                  >
                    <div className="relative z-10 text-left">
                      <h4 className="font-bold mb-1">Meus Favoritos</h4>
                      <p className={cn("text-xs mb-4", selectedCategory === 'favorites' ? "text-amber-100" : "text-emerald-200")}>
                        {selectedCategory === 'favorites' ? "Mostrando leis salvas" : "Acesse rapidamente suas leis salvas."}
                      </p>
                      <div className="text-3xl font-bold">{favorites.length}</div>
                    </div>
                    <Star className={cn("absolute -right-4 -bottom-4 w-24 h-24 opacity-50", selectedCategory === 'favorites' ? "text-amber-700 fill-current" : "text-emerald-800")} />
                  </button>
                )}
              </aside>

              {/* Main Content */}
              <div className="lg:col-span-3 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-serif font-bold text-stone-900">
                    {selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : 'Legislação Recente'}
                  </h2>
                  <div className="flex items-center gap-2 text-stone-400 text-sm">
                    <Filter className="w-4 h-4" />
                    <span>{filteredLaws.length} resultados</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredLaws.map(law => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={law.id}
                      className="bg-white p-5 rounded-2xl border border-stone-200 hover:shadow-lg transition-all cursor-pointer group"
                      onClick={() => setViewingLaw(law)}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="flex items-center gap-1.5 px-2 py-1 bg-stone-100 text-stone-500 text-[10px] font-bold uppercase tracking-wider rounded">
                          <CategoryIcon name={categories.find(c => c.id === law.category)?.icon} className="w-3 h-3" />
                          {categories.find(c => c.id === law.category)?.name || 'Geral'}
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(law.id); }}
                          className={cn(
                            "p-1.5 rounded-full transition",
                            favorites.includes(law.id) ? "text-amber-500 bg-amber-50" : "text-stone-300 hover:text-amber-500 hover:bg-amber-50"
                          )}
                        >
                          <Star className={cn("w-4 h-4", favorites.includes(law.id) && "fill-current")} />
                        </button>
                      </div>
                      <h3 className="font-bold text-lg mb-2 group-hover:text-emerald-700 transition line-clamp-2">{law.title}</h3>
                      <p className="text-stone-500 text-sm line-clamp-3 mb-4 leading-relaxed">
                        {law.content.replace(/[#*`]/g, '')}
                      </p>
                      <div className="flex items-center justify-between text-stone-400 text-xs pt-4 border-t border-stone-50">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> {law.viewCount || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" /> {law.downloadCount || 0}
                          </span>
                        </div>
                        <span>{law.year || 'N/A'}</span>
                      </div>
                    </motion.div>
                  ))}
                  {filteredLaws.length === 0 && (
                    <div className="col-span-full py-20 text-center text-stone-400">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>Nenhuma lei encontrada para esta busca.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="bg-white border-t border-stone-200 mt-20 py-12">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <Scale className="w-8 h-8 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500 text-sm">© 2026 LexMoz - Plataforma Jurídica de Moçambique</p>
            <p className="text-stone-400 text-xs mt-2">Desenvolvido para facilitar o acesso à justiça e legislação.</p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

// --- Sub-Components ---

function LawViewer({ law, onBack, isFavorite, onToggleFavorite, onDownload, onDelete, user }: { 
  law: Law, 
  onBack: () => void, 
  isFavorite: boolean, 
  onToggleFavorite: () => void,
  onDownload: () => void,
  onDelete: () => void,
  user: UserProfile | null
}) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'pdf'>('text');

  useEffect(() => {
    // Increment view count
    const incrementView = async () => {
      try {
        await updateDoc(doc(db, 'laws', law.id), {
          viewCount: (law.viewCount || 0) + 1
        });
      } catch (err) {
        // Silently fail for guests if rules are still tight, but we updated them
        console.warn('Could not increment view count', err);
      }
    };
    incrementView();
  }, [law.id]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(law.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-4xl mx-auto"
    >
      <button onClick={onBack} className="flex items-center gap-2 text-stone-500 hover:text-emerald-700 mb-8 transition group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition" />
        Voltar para a lista
      </button>

      <div className="bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">
        <div className="p-8 md:p-12 border-b border-stone-100 bg-stone-50/50">
          <div className="flex flex-wrap gap-4 justify-between items-start mb-6">
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Documento Oficial</span>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-stone-900 leading-tight">{law.title}</h1>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onToggleFavorite}
                className={cn(
                  "p-3 rounded-2xl border transition",
                  isFavorite ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-white border-stone-200 text-stone-400 hover:border-amber-200 hover:text-amber-600"
                )}
              >
                <Star className={cn("w-5 h-5", isFavorite && "fill-current")} />
              </button>
              <button 
                onClick={handleCopy}
                title="Copiar conteúdo"
                className={cn(
                  "p-3 rounded-2xl border transition flex items-center gap-2",
                  copied ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-white border-stone-200 text-stone-400 hover:border-emerald-200 hover:text-emerald-600"
                )}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied && <span className="text-xs font-bold">Copiado!</span>}
              </button>
              <button className="p-3 bg-white border border-stone-200 rounded-2xl text-stone-400 hover:border-emerald-200 hover:text-emerald-600 transition">
                <Share2 className="w-5 h-5" />
              </button>
              {law.pdfUrl && (
                <div className="relative group">
                  <button 
                    onClick={onDownload}
                    className="flex items-center gap-2 bg-emerald-700 text-white px-6 py-3 rounded-2xl hover:bg-emerald-800 transition shadow-lg"
                  >
                    <Download className="w-5 h-5" />
                    Baixar PDF
                  </button>
                  {user?.role === 'admin' && (
                    <button 
                      onClick={onDelete}
                      className="ml-2 p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition"
                      title="Apagar Lei"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  {!user && (
                    <div className="absolute top-full mt-2 right-0 bg-stone-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                      Login necessário para baixar
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-6 text-sm text-stone-500">
            <div className="flex items-center gap-2">
              <Book className="w-4 h-4" />
              <span>{law.articleCount || 'Vários'} Artigos</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Publicado em {law.year || 'N/A'}</span>
            </div>
          </div>

          {law.pdfUrl && (
            <div className="mt-8 flex gap-2 p-1 bg-stone-100 rounded-2xl w-fit">
              <button 
                onClick={() => setViewMode('text')}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2",
                  viewMode === 'text' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <FileText className="w-4 h-4" />
                Texto Integral
              </button>
              <button 
                onClick={() => setViewMode('pdf')}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2",
                  viewMode === 'pdf' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <Eye className="w-4 h-4" />
                Visualizar PDF
              </button>
            </div>
          )}
        </div>

        <div className="p-8 md:p-12 prose prose-stone max-w-none">
          {viewMode === 'text' ? (
            <div className="markdown-content">
              <ReactMarkdown>
                {law.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>
                  Se a pré-visualização não carregar, o seu navegador pode estar a bloquear o conteúdo. 
                  Pode usar o botão <strong>Baixar PDF</strong> acima ou 
                  <a href={law.pdfUrl} target="_blank" rel="noopener noreferrer" className="ml-1 underline font-bold hover:text-amber-900">abrir numa nova aba</a>.
                </p>
              </div>
              
              <div className="w-full aspect-[1/1.4] rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 relative">
                <iframe 
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(law.pdfUrl)}&embedded=true`} 
                  className="w-full h-full relative z-10"
                  title={law.title}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                  <FileText className="w-12 h-12 text-stone-300" />
                  <p className="text-stone-500 font-medium">A carregar documento...</p>
                  <a 
                    href={law.pdfUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-6 py-2 bg-white border border-stone-200 rounded-xl text-stone-600 font-bold hover:bg-stone-50 transition shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir Documento Original
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AdminPanel({ categories, onClose, laws, onDeleteLaw }: { 
  categories: Category[], 
  onClose: () => void,
  laws: Law[],
  onDeleteLaw: (law: Law) => Promise<void>
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [year, setYear] = useState<number | ''>(new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'stats' | 'categories' | 'manage'>('upload');

  // Editing States
  const [editingLaw, setEditingLaw] = useState<Law | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Manual Category States
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Tag');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  // File Upload State
  const [uploadingFile, setUploadingFile] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const storageRef = ref(storage, `laws/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setPdfUrl(url);
      alert('Arquivo enviado com sucesso!');
    } catch (err) {
      console.error('Erro no upload:', err);
      alert('Erro ao enviar arquivo. Verifique as permissões do Storage.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName) return;
    setIsCreatingCat(true);
    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: newCatName,
          icon: newCatIcon
        });
        setEditingCategory(null);
        alert('Categoria atualizada!');
      } else {
        await addDoc(collection(db, 'categories'), {
          name: newCatName,
          icon: newCatIcon,
          description: ''
        });
        alert('Categoria criada!');
      }
      setNewCatName('');
      setNewCatIcon('Tag');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'categories');
    } finally {
      setIsCreatingCat(false);
    }
  };

  const handleRemoveFile = async () => {
    if (!pdfUrl) return;
    if (!confirm('Deseja remover este arquivo? Se ele foi enviado agora, será apagado do servidor.')) return;
    
    // If it's a storage URL, try to delete it
    if (pdfUrl.includes('firebasestorage.googleapis.com')) {
      try {
        const fileRef = ref(storage, pdfUrl);
        await deleteObject(fileRef);
      } catch (err) {
        console.error('Erro ao apagar arquivo:', err);
      }
    }
    
    setPdfUrl('');
    alert('Arquivo removido!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !category || !content) return;
    
    setIsSubmitting(true);
    try {
      if (editingLaw) {
        await updateDoc(doc(db, 'laws', editingLaw.id), {
          title,
          category,
          content,
          pdfUrl,
          year: Number(year),
          updatedAt: Timestamp.now()
        });
        setEditingLaw(null);
        alert('Lei atualizada com sucesso!');
      } else {
        await addDoc(collection(db, 'laws'), {
          title,
          category,
          content,
          pdfUrl,
          year: Number(year),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          viewCount: 0,
          downloadCount: 0
        });
        alert('Lei adicionada com sucesso!');
      }
      setTitle('');
      setContent('');
      setPdfUrl('');
      setCategory('');
      setYear(new Date().getFullYear());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'laws');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingLaw = (law: Law) => {
    setEditingLaw(law);
    setTitle(law.title);
    setCategory(law.category);
    setContent(law.content);
    setPdfUrl(law.pdfUrl || '');
    setYear(law.year || new Date().getFullYear());
    setActiveTab('upload');
  };

  const startEditingCategory = (cat: Category) => {
    setEditingCategory(cat);
    setNewCatName(cat.name);
    setNewCatIcon(cat.icon || 'Tag');
    setActiveTab('categories');
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!confirm(`Tem certeza que deseja apagar a categoria "${cat.name}"? Todas as leis associadas a esta categoria ficarão sem categoria visível.`)) return;
    
    setIsCreatingCat(true); // Using this as a generic loading state for category actions
    try {
      const batch = writeBatch(db);
      
      // 1. Delete the category document
      batch.delete(doc(db, 'categories', cat.id));
      
      // 2. Find and update all laws that use this category
      const associatedLaws = laws.filter(l => l.category === cat.id);
      associatedLaws.forEach(law => {
        batch.update(doc(db, 'laws', law.id), { 
          category: '',
          updatedAt: Timestamp.now()
        });
      });
      
      await batch.commit();
      alert(`Categoria "${cat.name}" apagada e ${associatedLaws.length} leis atualizadas!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'categories');
    } finally {
      setIsCreatingCat(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-600" />
          Painel Administrativo
        </h2>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex gap-4 border-b border-stone-200">
        <button 
          onClick={() => { setActiveTab('upload'); setEditingLaw(null); }}
          className={cn("pb-4 px-4 text-sm font-bold transition", activeTab === 'upload' ? "border-b-2 border-emerald-600 text-emerald-700" : "text-stone-400")}
        >
          {editingLaw ? 'Editar Lei' : 'Upload de Leis'}
        </button>
        <button 
          onClick={() => setActiveTab('manage')}
          className={cn("pb-4 px-4 text-sm font-bold transition", activeTab === 'manage' ? "border-b-2 border-emerald-600 text-emerald-700" : "text-stone-400")}
        >
          Gerir e Excluir
        </button>
        <button 
          onClick={() => { setActiveTab('categories'); setEditingCategory(null); }}
          className={cn("pb-4 px-4 text-sm font-bold transition", activeTab === 'categories' ? "border-b-2 border-emerald-600 text-emerald-700" : "text-stone-400")}
        >
          Categorias
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={cn("pb-4 px-4 text-sm font-bold transition", activeTab === 'stats' ? "border-b-2 border-emerald-600 text-emerald-700" : "text-stone-400")}
        >
          Estatísticas
        </button>
      </div>

      {activeTab === 'upload' ? (
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-500 uppercase">Título da Lei</label>
              <input 
                required
                type="text" 
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Ex: Constituição da República de Moçambique"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-500 uppercase">Categoria</label>
              <div className="flex gap-2">
                <select 
                  required
                  className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  <option value="">Selecionar...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button 
                  type="button"
                  onClick={() => setActiveTab('categories')}
                  className="p-3 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition"
                  title="Adicionar nova categoria"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-500 uppercase">Arquivo PDF</label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="https://exemplo.com/lei.pdf"
                    value={pdfUrl}
                    onChange={e => setPdfUrl(e.target.value)}
                  />
                  <label className="cursor-pointer p-3 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition flex items-center gap-2">
                    <UploadCloud className="w-5 h-5" />
                    <span className="text-sm font-bold">{uploadingFile ? '...' : 'Upload'}</span>
                    <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                  </label>
                </div>
                {pdfUrl && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                      <FileText className="w-4 h-4" />
                      Documento carregado
                    </div>
                    <div className="flex items-center gap-3">
                      <a 
                        href={pdfUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Pré-visualizar
                      </a>
                      <button 
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-red-500 hover:text-red-700"
                        title="Remover arquivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-500 uppercase">Ano de Publicação</label>
              <input 
                required
                type="number" 
                min="1900"
                max={new Date().getFullYear() + 5}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Ex: 2024"
                value={year}
                onChange={e => setYear(e.target.value ? Number(e.target.value) : '')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase">Conteúdo (Markdown)</label>
            <textarea 
              required
              rows={10}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
              placeholder="# Artigo 1... \n\n O conteúdo da lei aqui..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            {editingLaw && (
              <>
                <button 
                  type="button"
                  onClick={() => { setEditingLaw(null); setTitle(''); setContent(''); setPdfUrl(''); setCategory(''); }}
                  className="flex-1 bg-stone-200 text-stone-600 py-4 rounded-2xl font-bold hover:bg-stone-300 transition"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    onDeleteLaw(editingLaw);
                    setEditingLaw(null);
                    setTitle('');
                    setContent('');
                    setPdfUrl('');
                    setCategory('');
                  }}
                  className="flex-1 bg-red-100 text-red-600 py-4 rounded-2xl font-bold hover:bg-red-200 transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Excluir Lei
                </button>
              </>
            )}
            <button 
              disabled={isSubmitting}
              type="submit"
              className="flex-[2] bg-emerald-700 text-white py-4 rounded-2xl font-bold hover:bg-emerald-800 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando...' : <>{editingLaw ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />} {editingLaw ? 'Salvar Alterações' : 'Adicionar Lei'}</>}
            </button>
          </div>
        </form>
      ) : activeTab === 'manage' ? (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-stone-50 border-b border-stone-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Título</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Categoria</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {laws.map(l => (
                <tr key={l.id}>
                  <td className="px-6 py-4 font-medium text-sm">{l.title}</td>
                  <td className="px-6 py-4 text-sm text-stone-500">
                    {categories.find(c => c.id === l.category)?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button 
                        onClick={() => startEditingLaw(l)} 
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onDeleteLaw(l)} 
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Excluir Lei e Documento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'categories' ? (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <h3 className="font-bold text-lg">{editingCategory ? 'Editar Categoria' : 'Criar Nova Categoria'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase">Nome da Categoria</label>
                <input 
                  type="text" 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Ex: Direito Comercial"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase">Ícone (Lucide)</label>
                <select 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  value={newCatIcon}
                  onChange={e => setNewCatIcon(e.target.value)}
                >
                  {Object.keys(ICON_MAP).map(icon => <option key={icon} value={icon}>{icon}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                {editingCategory && (
                  <button 
                    onClick={() => { setEditingCategory(null); setNewCatName(''); }}
                    className="flex-1 bg-stone-100 text-stone-600 p-3 rounded-xl font-bold hover:bg-stone-200 transition"
                  >
                    Cancelar
                  </button>
                )}
                <button 
                  onClick={handleCreateCategory}
                  disabled={isCreatingCat || !newCatName}
                  className="flex-[2] bg-emerald-700 text-white p-3 rounded-xl font-bold hover:bg-emerald-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {editingCategory ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />} 
                  {editingCategory ? 'Salvar' : 'Criar Categoria'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-stone-50 border-b border-stone-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Ícone</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Nome</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td className="px-6 py-4">
                      <CategoryIcon name={cat.icon} className="w-5 h-5 text-stone-400" />
                    </td>
                    <td className="px-6 py-4 font-medium">{cat.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button onClick={() => startEditingCategory(cat)} className="text-emerald-600 hover:text-emerald-800">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteCategory(cat)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <p className="text-stone-400 text-xs font-bold uppercase mb-2">Total de Leis</p>
            <p className="text-3xl font-bold">{laws.length}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <p className="text-stone-400 text-xs font-bold uppercase mb-2">Visualizações Totais</p>
            <p className="text-3xl font-bold text-emerald-600">
              {laws.reduce((acc, l) => acc + (l.viewCount || 0), 0)}
            </p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <p className="text-stone-400 text-xs font-bold uppercase mb-2">Downloads Totais</p>
            <p className="text-3xl font-bold text-blue-600">
              {laws.reduce((acc, l) => acc + (l.downloadCount || 0), 0)}
            </p>
          </div>
          
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
              <h4 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Novas Inserções
              </h4>
              <button 
                onClick={() => setActiveTab('upload')}
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition shadow-sm"
              >
                Adicionar Nova Lei
              </button>
            </div>
            <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
              <h4 className="font-bold text-red-800 mb-4 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Gestão e Exclusão
              </h4>
              <button 
                onClick={() => setActiveTab('manage')}
                className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition shadow-sm"
              >
                Gerir e Excluir Leis/Documentos
              </button>
            </div>
          </div>
          
          <div className="md:col-span-3 bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-stone-50 border-b border-stone-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Lei</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Views</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {laws.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 5).map(l => (
                  <tr key={l.id}>
                    <td className="px-6 py-4 font-medium text-sm">{l.title}</td>
                    <td className="px-6 py-4 text-sm">{l.viewCount || 0}</td>
                    <td className="px-6 py-4 text-sm">{l.downloadCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
