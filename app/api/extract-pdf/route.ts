// File: app/api/extract-pdf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// Promisify fs functions
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

export async function POST(req: NextRequest) {
    try {
        // Process the form data and validate PDF file
        const formData = await req.formData();
        const pdfFile = formData.get('pdf') as File;

        if (!pdfFile) {
            return NextResponse.json(
                { error: 'No PDF file provided' },
                { status: 400 }
            );
        }

        // Ensure the file has a PDF extension and proper MIME type
        if (!pdfFile.name.endsWith('.pdf') || pdfFile.type !== 'application/pdf') {
            return NextResponse.json(
                { error: 'File must be a PDF' },
                { status: 400 }
            );
        }

        // Create a temporary directory to store the PDF if it doesn't exist
        const tempDir = path.join(process.cwd(), 'tmp');
        await mkdirAsync(tempDir, { recursive: true });

        // Generate a unique filename for the temporary PDF
        const fileId = uuidv4();
        const filePath = path.join(tempDir, `${fileId}.pdf`);

        // Save the uploaded PDF to the temporary directory
        const fileBuffer = await pdfFile.arrayBuffer();
        await writeFileAsync(filePath, Buffer.from(fileBuffer));

        console.log(`Processing PDF: ${pdfFile.name} at ${filePath}`);

        // Use LangChain’s PDFLoader to load the PDF file from disk.
        // The loader typically returns an array where each element
        // corresponds to one page of the PDF.
        const loader = new PDFLoader(filePath);
        const documents = await loader.load();

        // Remove the temporary file as it's no longer needed.
        await unlinkAsync(filePath);

        // Process each page: split the page's text into paragraphs.
        // This creates an array of pages where each page has its
        // original text and an array of paragraphs.
        const pages = documents.map((doc) => doc.pageContent);

        // Collect overall metadata for reference.
        const metadata = {
            filename: pdfFile.name,
            fileSize: pdfFile.size,
            uploadedAt: new Date().toISOString(),
            documentId: fileId,
            numPages: documents.length,
        };

        // Return a structured JSON response including page-wise splitting.
        return NextResponse.json({
            success: true,
            pages,
            metadata,
        });
    } catch (error: any) {
        console.error('Error extracting PDF via LangChain:', error);
        return NextResponse.json(
            {
                error: 'Failed to extract PDF text',
                message: error.message,
            },
            { status: 500 }
        );
    }
}
