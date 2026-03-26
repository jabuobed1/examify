import { useRef } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';

export const MarkingCanvas = ({ imageUrl, onSave }) => {
  const canvasRef = useRef(null);
  
  // This function triggers when the student is done marking
  const handleExport = async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await canvasRef.current.exportImage("png");
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "graded-work.png", { type: "image/png" });
      onSave(file);
    } catch (error) {
      console.error("Failed to export image", error);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.8)', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '800px', height: '80vh', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
        <ReactSketchCanvas
          ref={canvasRef}
          width="100%"
          height="100%"
          strokeWidth={4}
          strokeColor="red"
          backgroundImage={imageUrl}
          preserveBackgroundImageAspectRatio="contain"
          exportWithBackgroundImage={true}
        />
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}>
          <button 
            className="btn-primary rounded-lg px-6 py-2 font-bold shadow-lg"
            onClick={handleExport} 
          >
            Submit Grade
          </button>
        </div>
      </div>
    </div>
  );
};