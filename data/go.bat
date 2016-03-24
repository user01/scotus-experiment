for %%f in (*.pdf) do (
        echo %%~nf.txt
        pdftotext.exe %%~nf.pdf %%~nf.txt
)
