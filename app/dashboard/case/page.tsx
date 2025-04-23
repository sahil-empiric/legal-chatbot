"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Plus,
    Search,
    Pencil,
    Trash2,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

// Initialize Supabase client
// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// const supabase = createClient(supabaseUrl, supabaseAnonKey);

const supabase = createBrowserClient();

interface Case {
    id: string;
    title: string;
    created_by: string;
    created_at: string;
}

interface User {
    id: string
}

const CaseManagement = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [cases, setCases] = useState<Case[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [title, setTitle] = useState("");
    const [currentCase, setCurrentCase] = useState<Case | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    const { session, isLoading: loading } = useAuth();

    const fetchCases = async () => {
        setIsLoading(true);
        if (!user?.id) return

        try {
            const { data, error } = await supabase
                .from('cases')
                .select('*')
                .eq('created_by', user?.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCases(data || []);
        } catch (error) {
            console.error('Error fetching cases:', error);
            toast.error('Failed to load cases');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (currentCase) {
                // Update existing case
                const { error } = await supabase
                    .from('cases')
                    .update({ title, created_by: user?.id || "", })
                    .eq('id', currentCase.id);

                if (error) throw error;
                toast.success("Case updated successfully!");
            } else {
                // Add new case
                const { error } = await supabase
                    .from('cases')
                    .insert([{ title, created_by: user?.id || "", }]);

                if (error) throw error;
                toast.success("Case added successfully!");
            }

            resetForm();
            fetchCases();
        } catch (error) {
            console.error(`Error ${currentCase ? 'updating' : 'adding'} case:`, error);
            toast.error(`Failed to ${currentCase ? 'update' : 'add'} case`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        setIsDeleting(id);

        try {
            // Delete case from database
            const { error } = await supabase
                .from('cases')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success("Case deleted successfully!");
            fetchCases();
        } catch (error) {
            console.error('Error deleting case:', error);
            toast.error('Failed to delete case');
        } finally {
            setIsDeleting(null);
        }
    };

    const openAddModal = () => {
        setCurrentCase(null);
        setTitle("");
        setIsModalOpen(true);
    };

    const openEditModal = (caseItem: Case) => {
        setCurrentCase(caseItem);
        setTitle(caseItem.title);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setIsModalOpen(false);
        setCurrentCase(null);
        setTitle("");
    };

    const filteredCases = cases.filter((caseItem) =>
        caseItem.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Format date for display
    const formatDate = (dateString: string) => {
        return new Date(
            dateString).toLocaleString();
    };

    // Fetch cases from Supabase on component mount
    useEffect(() => {
        fetchCases();
    }, [user]);

    useEffect(() => {
        if (session?.user) {
            setUser(session.user);
        }
    }, [session]);
    return (
        <div className="container mx-auto">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Cases</h1>
                        <p className="text-muted-foreground">Manage your cases</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="relative w-full sm:w-96">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search cases..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button onClick={openAddModal}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Case
                        </Button>
                    </div>
                </div>

                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[300px]">Title</TableHead>
                                <TableHead className="w-[200px]">Created By</TableHead>
                                <TableHead className="w-[200px]">Created At</TableHead>
                                <TableHead className="w-[120px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <div className="flex justify-center items-center">
                                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                            Loading cases...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredCases.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No cases found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCases.map((caseItem) => (
                                    <TableRow key={caseItem.id}>
                                        <TableCell className="font-medium">
                                            <Link
                                                key={caseItem.id}
                                                href={`/dashboard/case/${caseItem.id}`}
                                                passHref
                                                className="underline"
                                            >
                                                {caseItem.title}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{caseItem.created_by}</TableCell>
                                        <TableCell>{formatDate(caseItem.created_at)}</TableCell>
                                        <TableCell>
                                            <div className="flex space-x-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditModal(caseItem)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 hover:text-red-700"
                                                    onClick={() => handleDelete(caseItem.id)}
                                                    disabled={isDeleting === caseItem.id}
                                                >
                                                    {isDeleting === caseItem.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>


            {/* Unified Add/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{currentCase ? "Edit Case" : "Add New Case"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="case-title" className="text-sm font-medium">Case Title</label>
                            <Input
                                id="case-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter case title"
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                type="button"
                                onClick={resetForm}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {currentCase ? "Updating..." : "Adding..."}
                                    </>
                                ) : (
                                    currentCase ? "Update Case" : "Add Case"
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default CaseManagement;