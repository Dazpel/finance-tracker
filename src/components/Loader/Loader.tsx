import { Spinner } from '@nextui-org/react';
import React from 'react';

const FullScreenOverlay = () => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-[300]">
      <Spinner color="primary" size="lg"/>
    </div>
  );
};

export default FullScreenOverlay;